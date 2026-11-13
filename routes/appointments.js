const express = require('express');
const router = express.Router();
const db = require('../config/db');

// BOOK APPOINTMENT (with clash detection)
router.post('/book', async (req, res) => {
  try {
    const { patient_id, doctor_id, date, time, notes, is_emergency } = req.body;

    if (!patient_id || !doctor_id || !date || !time) {
      return res.status(400).json({ error: 'patient_id, doctor_id, date and time are required' });
    }

    // ── 1. Check for exact time clash ──────────────────────────────
    const [clash] = await db.execute(
      `SELECT id FROM appointments
       WHERE doctor_id = ?
         AND appointment_date = ?
         AND appointment_time = ?
         AND status NOT IN ('cancelled')`,
      [doctor_id, date, time]
    );
    if (clash.length > 0) {
      return res.status(400).json({
        error: '⚠️ This time slot is already booked. Please choose a different time.'
      });
    }

    // ── 2. Check for slots within 30 minutes of each other ─────────
    const [nearbySlots] = await db.execute(
      `SELECT appointment_time FROM appointments
       WHERE doctor_id = ?
         AND appointment_date = ?
         AND status NOT IN ('cancelled')`,
      [doctor_id, date]
    );

    const newTime = timeToMinutes(time);
    for (const slot of nearbySlots) {
      const existing = timeToMinutes(slot.appointment_time);
      if (Math.abs(newTime - existing) < 30) {
        const existingFormatted = formatTime(slot.appointment_time);
        return res.status(400).json({
          error: `⚠️ Too close to another appointment at ${existingFormatted}. Please leave at least 30 minutes gap.`
        });
      }
    }

    // ── 3. Check patient doesn't double-book same day same time ────
    const [patientClash] = await db.execute(
      `SELECT id FROM appointments
       WHERE patient_id = ?
         AND appointment_date = ?
         AND appointment_time = ?
         AND status NOT IN ('cancelled')`,
      [patient_id, date, time]
    );
    if (patientClash.length > 0) {
      return res.status(400).json({
        error: '⚠️ You already have an appointment at this time.'
      });
    }

    // ── 4. All clear — save the appointment ────────────────────────
    const [result] = await db.execute(
      `INSERT INTO appointments
         (patient_id, doctor_id, appointment_date, appointment_time, notes, is_emergency, status)
       VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
      [patient_id, doctor_id, date, time, notes || '', is_emergency || false]
    );

    // ── 5. Auto-update doctor availability ────────────────────────
    await updateDoctorAvailability(doctor_id);

    res.json({ message: 'Appointment booked successfully!', id: result.insertId });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET APPOINTMENTS FOR A PATIENT
router.get('/patient/:id', async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT a.*, u.name AS doctor_name, d.specialization, d.id AS doctor_id
       FROM appointments a
       JOIN doctors d ON a.doctor_id = d.id
       JOIN users u ON d.user_id = u.id
       WHERE a.patient_id = ?
       ORDER BY a.appointment_date DESC, a.appointment_time DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET ALL APPOINTMENTS (admin)
router.get('/all', async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT a.*,
              p.name AS patient_name,
              u.name AS doctor_name,
              d.specialization
       FROM appointments a
       JOIN users p ON a.patient_id = p.id
       JOIN doctors d ON a.doctor_id = d.id
       JOIN users u ON d.user_id = u.id
       ORDER BY a.appointment_date DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET AVAILABLE SLOTS FOR A DOCTOR ON A DATE
router.get('/slots/:doctorId/:date', async (req, res) => {
  try {
    const { doctorId, date } = req.params;

    // All possible slots from 9am to 5pm every 30 min
    const allSlots = generateSlots('09:00', '17:00', 30);

    // Get booked slots for that doctor on that date
    const [booked] = await db.execute(
      `SELECT appointment_time FROM appointments
       WHERE doctor_id = ? AND appointment_date = ? AND status != 'cancelled'`,
      [doctorId, date]
    );

    const bookedTimes = booked.map(b => b.appointment_time.substring(0, 5));

    // Mark each slot as available or booked
    const slots = allSlots.map(slot => ({
      time: slot,
      available: !bookedTimes.some(b => Math.abs(timeToMinutes(b) - timeToMinutes(slot)) < 30)
    }));

    res.json(slots);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UPDATE STATUS
router.put('/status/:id', async (req, res) => {
  try {
    const { status } = req.body;
    const { id } = req.params;

    // Get doctor_id for this appointment
    const [appt] = await db.execute('SELECT doctor_id FROM appointments WHERE id = ?', [id]);
    if (!appt.length) return res.status(404).json({ error: 'Appointment not found' });

    await db.execute('UPDATE appointments SET status = ? WHERE id = ?', [status, id]);

    // Auto-update doctor availability after status change
    await updateDoctorAvailability(appt[0].doctor_id);

    res.json({ message: 'Status updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── HELPER FUNCTIONS ───────────────────────────────────────────────

// Convert "HH:MM" to total minutes
function timeToMinutes(t) {
  const str = String(t).substring(0, 5);
  const [h, m] = str.split(':').map(Number);
  return h * 60 + m;
}

// Format "HH:MM:SS" → "9:00 AM"
function formatTime(t) {
  const str = String(t).substring(0, 5);
  const [h, m] = str.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, '0')} ${suffix}`;
}

// Generate time slots between start and end every `gapMins` minutes
function generateSlots(start, end, gapMins) {
  const slots = [];
  let current = timeToMinutes(start);
  const endMins = timeToMinutes(end);
  while (current <= endMins) {
    const h = Math.floor(current / 60).toString().padStart(2, '0');
    const m = (current % 60).toString().padStart(2, '0');
    slots.push(`${h}:${m}`);
    current += gapMins;
  }
  return slots;
}

// Auto set doctor available=true or false based on upcoming appointments today
async function updateDoctorAvailability(doctorId) {
  const today = new Date().toISOString().split('T')[0];
  const nowMins = new Date().getHours() * 60 + new Date().getMinutes();

  const [upcoming] = await db.execute(
    `SELECT appointment_time FROM appointments
     WHERE doctor_id = ?
       AND appointment_date = ?
       AND status IN ('pending', 'confirmed')`,
    [doctorId, today]
  );

  // Doctor is "busy" if they have an appointment within the next 30 minutes
  let isBusy = false;
  for (const appt of upcoming) {
    const apptMins = timeToMinutes(appt.appointment_time);
    if (apptMins >= nowMins && apptMins <= nowMins + 30) {
      isBusy = true;
      break;
    }
  }

  await db.execute(
    'UPDATE doctors SET available = ? WHERE id = ?',
    [!isBusy, doctorId]
  );
}
// GET APPOINTMENTS FOR A DOCTOR
router.get('/doctor/:id', async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT a.*,
              u.name  AS patient_name,
              u.phone AS patient_phone,
              u.email AS patient_email
       FROM appointments a
       JOIN users u ON a.patient_id = u.id
       WHERE a.doctor_id = ?
       ORDER BY a.appointment_date DESC, a.appointment_time DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;