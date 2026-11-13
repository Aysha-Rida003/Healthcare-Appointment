const API = '';
let currentUser = JSON.parse(localStorage.getItem('hc_user')) || null;
let allDoctors = [];
let currentDocTab = 'pending';
let myDoctorId = null;

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  updateNavForUser();
  loadDoctors();
  const today = new Date().toISOString().split('T')[0];
  const dateInput = document.getElementById('bookDate');
  if (dateInput) dateInput.min = today;
});

// ===== NAVIGATION =====
function showSection(id) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  if (id === 'appointments')    loadAppointments();
  if (id === 'doctors')         loadDoctors();
  if (id === 'doctorDashboard') loadDoctorDashboard();
}

// ===== MODALS =====
function openModal(id) {
  document.getElementById(id).classList.add('open');
  if (id === 'bookModal') loadDoctorsForBooking();
}
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
  clearErrors();
}
function switchModal(closeId, openId) {
  closeModal(closeId);
  openModal(openId);
}
function clearErrors() {
  document.querySelectorAll('.error-msg').forEach(e => e.textContent = '');
}

// ===== AUTH =====
function updateNavForUser() {
  const btn = document.getElementById('authBtn');
  const navLinks = document.getElementById('navLinks');

  if (currentUser) {
    btn.textContent = `Logout (${currentUser.name.split(' ')[0]})`;
    btn.onclick = logout;

    // Show doctor dashboard link if user is a doctor
    if (currentUser.role === 'doctor') {
      document.getElementById('doctorNavLink').style.display = 'inline';
    } else {
      document.getElementById('doctorNavLink').style.display = 'none';
    }
  } else {
    btn.textContent = 'Login';
    btn.onclick = () => openModal('loginModal');
    document.getElementById('doctorNavLink').style.display = 'none';
  }
}

async function register() {
  const name     = document.getElementById('regName').value.trim();
  const email    = document.getElementById('regEmail').value.trim();
  const phone    = document.getElementById('regPhone').value.trim();
  const password = document.getElementById('regPass').value;
  const role     = document.getElementById('regRole').value;
  const spec     = document.getElementById('regSpec') ? document.getElementById('regSpec').value.trim() : '';
  const exp      = document.getElementById('regExp')  ? document.getElementById('regExp').value : 0;
  const errEl    = document.getElementById('registerError');

  if (!name || !email || !password) { errEl.textContent = 'Please fill all required fields.'; return; }
  if (password.length < 6) { errEl.textContent = 'Password must be at least 6 characters.'; return; }

  try {
    const res  = await fetch(`${API}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, phone, password, role, specialization: spec, experience: exp })
    });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error; return; }
    alert('✅ Account created! Please login.');
    switchModal('registerModal', 'loginModal');
  } catch (err) {
    errEl.textContent = 'Network error. Is the server running?';
  }
}

async function login() {
  const email    = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPass').value;
  const errEl    = document.getElementById('loginError');

  if (!email || !password) { errEl.textContent = 'Please enter email and password.'; return; }

  try {
    const res  = await fetch(`${API}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error; return; }

    localStorage.setItem('hc_token', data.token);
    localStorage.setItem('hc_user', JSON.stringify(data.user));
    currentUser = data.user;
    updateNavForUser();
    closeModal('loginModal');

    // Redirect doctor to their dashboard automatically
    if (data.user.role === 'doctor') {
      alert(`👋 Welcome Dr. ${data.user.name}! Redirecting to your dashboard.`);
      showSection('doctorDashboard');
    } else {
      alert(`👋 Welcome back, ${data.user.name}!`);
    }
  } catch (err) {
    errEl.textContent = 'Network error. Is the server running?';
  }
}

function logout() {
  localStorage.removeItem('hc_token');
  localStorage.removeItem('hc_user');
  currentUser = null;
  myDoctorId  = null;
  updateNavForUser();
  showSection('home');
  alert('Logged out successfully.');
}

function toggleDoctorFields() {
  const role = document.getElementById('regRole').value;
  document.getElementById('doctorFields').style.display = role === 'doctor' ? 'block' : 'none';
}

// ===== DOCTORS LIST =====
async function loadDoctors() {
  const container = document.getElementById('doctorsList');
  if (!container) return;
  container.innerHTML = '<div class="loading">Loading doctors...</div>';
  try {
    const res = await fetch(`${API}/api/doctors`);
    allDoctors = await res.json();
    renderDoctors(allDoctors);
  } catch (err) {
    container.innerHTML = '<div class="empty-state">⚠️ Could not load doctors. Is the server running?</div>';
  }
}

function renderDoctors(doctors) {
  const container = document.getElementById('doctorsList');
  if (!doctors.length) {
    container.innerHTML = '<div class="empty-state">No doctors found. Register a doctor account first.</div>';
    return;
  }
  container.innerHTML = doctors.map(d => `
    <div class="doctor-card">
      <div class="doctor-avatar">👨‍⚕️</div>
      <h3>${d.name}</h3>
      <div class="spec">${d.specialization}</div>
      <div class="meta">
        <span>⏱ ${d.experience_years} yrs exp</span>
        <span>⭐ ${d.rating > 0 ? d.rating : 'No ratings yet'}</span>
      </div>
      <span class="avail-badge ${d.available ? 'available' : 'unavailable'}">
        ${d.available ? '✅ Available' : '❌ Unavailable'}
      </span>
      <br/><br/>
      <button class="btn-book" onclick="bookWithDoctor(${d.id})">
        📅 Book Appointment
      </button>
    </div>
  `).join('');
}

function filterDoctors() {
  const q = document.getElementById('doctorSearch').value.toLowerCase();
  const filtered = allDoctors.filter(d =>
    d.name.toLowerCase().includes(q) ||
    d.specialization.toLowerCase().includes(q)
  );
  renderDoctors(filtered);
}

function bookWithDoctor(doctorId) {
  if (!currentUser) {
    alert('Please login first to book an appointment.');
    openModal('loginModal');
    return;
  }
  if (currentUser.role === 'doctor') {
    alert('Doctors cannot book appointments. Please login as a patient.');
    return;
  }
  openModal('bookModal');
  setTimeout(() => {
    const sel = document.getElementById('bookDoctor');
    if (sel) sel.value = doctorId;
    onDoctorOrDateChange();
  }, 400);
}

async function loadDoctorsForBooking() {
  try {
    const res     = await fetch(`${API}/api/doctors`);
    const doctors = await res.json();
    const sel     = document.getElementById('bookDoctor');
    sel.innerHTML = '<option value="">-- Select a Doctor --</option>' +
      doctors.map(d =>
        `<option value="${d.id}">${d.name} — ${d.specialization} (${d.available ? '✅ Available' : '❌ Busy'})</option>`
      ).join('');
  } catch (err) {
    document.getElementById('bookDoctor').innerHTML = '<option>Error loading doctors</option>';
  }
}

// ===== SLOTS =====
async function onDoctorOrDateChange() {
  const doctorId = document.getElementById('bookDoctor').value;
  const date     = document.getElementById('bookDate').value;
  const section  = document.getElementById('slotsSection');
  const grid     = document.getElementById('slotsGrid');

  document.getElementById('bookTime').value = '';

  if (!doctorId || !date) { section.style.display = 'none'; return; }

  section.style.display = 'block';
  grid.innerHTML = '<span style="color:var(--muted);font-size:13px">Loading slots...</span>';

  try {
    const res   = await fetch(`${API}/api/appointments/slots/${doctorId}/${date}`);
    const slots = await res.json();

    if (!slots.length) {
      grid.innerHTML = '<span style="color:var(--muted)">No slots available for this date.</span>';
      return;
    }

    grid.innerHTML = slots.map(s => `
      <button
        class="slot-btn ${!s.available ? 'booked' : ''}"
        ${!s.available ? 'disabled' : ''}
        onclick="selectSlot('${s.time}', this)"
      >
        ${formatSlotTime(s.time)}
        ${!s.available ? '<br/><small>Booked</small>' : ''}
      </button>
    `).join('');
  } catch (err) {
    grid.innerHTML = '<span style="color:red">Could not load slots.</span>';
  }
}

function selectSlot(time, btn) {
  document.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  document.getElementById('bookTime').value = time;
  document.getElementById('bookError').textContent = '';
}

function formatSlotTime(t) {
  const [h, m] = t.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour   = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, '0')} ${suffix}`;
}

// ===== BOOK APPOINTMENT =====
async function bookAppointment() {
  if (!currentUser) {
    alert('Please login first.');
    closeModal('bookModal');
    openModal('loginModal');
    return;
  }

  const doctor_id    = document.getElementById('bookDoctor').value;
  const date         = document.getElementById('bookDate').value;
  const time         = document.getElementById('bookTime').value;
  const notes        = document.getElementById('bookNotes').value;
  const is_emergency = document.getElementById('bookEmergency').checked;
  const errEl        = document.getElementById('bookError');

  if (!doctor_id)  { errEl.textContent = '⚠️ Please select a doctor.'; return; }
  if (!date)       { errEl.textContent = '⚠️ Please select a date.'; return; }
  if (!time)       { errEl.textContent = '⚠️ Please select a time slot.'; return; }

  const btn = document.querySelector('#bookModal .btn-primary.full');
  btn.textContent = 'Booking...';
  btn.disabled = true;

  try {
    const res  = await fetch(`${API}/api/appointments/book`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': localStorage.getItem('hc_token') || ''
      },
      body: JSON.stringify({
        patient_id: currentUser.id,
        doctor_id: parseInt(doctor_id),
        date, time, notes, is_emergency
      })
    });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error || 'Booking failed.'; btn.textContent = 'Confirm Booking'; btn.disabled = false; return; }

    alert(`✅ Appointment booked!\n📅 ${date} at ${formatSlotTime(time)}\n\nWaiting for doctor confirmation.`);
    closeModal('bookModal');
    document.getElementById('bookDoctor').value = '';
    document.getElementById('bookDate').value   = '';
    document.getElementById('bookTime').value   = '';
    document.getElementById('bookNotes').value  = '';
    document.getElementById('bookEmergency').checked = false;
    document.getElementById('slotsSection').style.display = 'none';
    showSection('appointments');
  } catch (err) {
    errEl.textContent = '⚠️ Network error. Make sure server is running.';
  } finally {
    btn.textContent = 'Confirm Booking';
    btn.disabled    = false;
  }
}

// ===== PATIENT APPOINTMENTS =====
async function loadAppointments() {
  if (!currentUser) {
    document.getElementById('appointmentsList').innerHTML =
      '<div class="empty-state">Please <a href="#" onclick="openModal(\'loginModal\')">login</a> to view your appointments.</div>';
    return;
  }

  const container = document.getElementById('appointmentsList');
  container.innerHTML = '<div class="loading">Loading...</div>';

  try {
    const res  = await fetch(`${API}/api/appointments/patient/${currentUser.id}`, {
      headers: { 'Authorization': localStorage.getItem('hc_token') || '' }
    });
    const data = await res.json();

    if (!data.length) {
      container.innerHTML = '<div class="empty-state">📭 No appointments yet. Book your first one!</div>';
      return;
    }

    container.innerHTML = data.map(a => `
      <div class="appt-card">
        <div class="appt-info">
          <h3>Dr. ${a.doctor_name}
            <small style="color:var(--muted);font-size:13px;font-weight:400">(${a.specialization})</small>
          </h3>
          <p>📅 ${new Date(a.appointment_date).toDateString()} &nbsp;⏰ ${formatSlotTime(a.appointment_time)}
            ${a.is_emergency ? '&nbsp;🚨 <b style="color:red">Emergency</b>' : ''}
          </p>
          ${a.notes ? `<p style="margin-top:4px;font-size:13px;color:var(--muted)">📝 ${a.notes}</p>` : ''}
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px">
          <span class="status-badge status-${a.status}">
            ${statusLabel(a.status)}
          </span>
          ${a.status === 'completed' ? `
            <button class="btn-rate" onclick="openRateModal(${a.doctor_id},'${a.doctor_name}',${a.id})">
              ⭐ Rate Doctor
            </button>` : ''}
          ${a.status === 'pending' ? `
            <button class="btn-cancel" onclick="cancelAppointment(${a.id})">
              ❌ Cancel
            </button>` : ''}
        </div>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = '<div class="empty-state">⚠️ Could not load appointments.</div>';
  }
}

function statusLabel(status) {
  const map = {
    pending:   '🕐 Pending',
    confirmed: '✅ Confirmed',
    cancelled: '❌ Cancelled',
    completed: '🏁 Completed'
  };
  return map[status] || status;
}

async function cancelAppointment(id) {
  if (!confirm('Are you sure you want to cancel this appointment?')) return;
  try {
    const res = await fetch(`${API}/api/appointments/status/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'cancelled' })
    });
    if (res.ok) { alert('Appointment cancelled.'); loadAppointments(); }
  } catch (err) {
    alert('Error cancelling appointment.');
  }
}

// ===== DOCTOR DASHBOARD =====
async function loadDoctorDashboard() {
  if (!currentUser || currentUser.role !== 'doctor') {
    alert('Access denied. Please login as a doctor.');
    showSection('home');
    return;
  }

  // Get this doctor's record
  try {
    const res     = await fetch(`${API}/api/doctors`);
    const doctors = await res.json();
    const me      = doctors.find(d => d.email === currentUser.email);
    if (!me) { alert('Doctor profile not found.'); return; }
    myDoctorId = me.id;

    // Set availability button
    const btn   = document.getElementById('docAvailBtn');
    btn.className = me.available ? 'btn-avail-on' : 'btn-avail-off';
    btn.textContent = me.available ? '✅ Available' : '❌ Unavailable';

    // Load appointments
    await loadDoctorAppointments();
  } catch (err) {
    console.error(err);
  }
}

async function loadDoctorAppointments() {
  const container = document.getElementById('docAppointmentsList');
  container.innerHTML = '<div class="loading">Loading...</div>';

  try {
    const res  = await fetch(`${API}/api/appointments/doctor/${myDoctorId}`, {
      headers: { 'Authorization': localStorage.getItem('hc_token') || '' }
    });
    const data = await res.json();

    // Update stats
    document.getElementById('statTotal').textContent     = data.length;
    document.getElementById('statConfirmed').textContent = data.filter(a => a.status === 'confirmed').length;
    document.getElementById('statPending').textContent   = data.filter(a => a.status === 'pending').length;
    document.getElementById('statCancelled').textContent = data.filter(a => a.status === 'cancelled').length;

    // Filter by current tab
    const filtered = currentDocTab === 'all'
      ? data
      : data.filter(a => a.status === currentDocTab);

    if (!filtered.length) {
      container.innerHTML = `<div class="empty-state">No ${currentDocTab} appointments.</div>`;
      return;
    }

    container.innerHTML = filtered.map(a => `
      <div class="doc-appt-card ${a.is_emergency ? 'emergency-card' : ''}">
        <div class="doc-appt-info">
          <h3>
            ${a.is_emergency ? '🚨 ' : ''}${a.patient_name}
            ${a.is_emergency ? '<span style="color:var(--red);font-size:13px;font-weight:600"> — EMERGENCY</span>' : ''}
          </h3>
          <p>📅 ${new Date(a.appointment_date).toDateString()} &nbsp;⏰ ${formatSlotTime(a.appointment_time)}</p>
          <p>📞 ${a.patient_phone || 'No phone provided'}</p>
          ${a.notes ? `<p>📝 ${a.notes}</p>` : ''}
        </div>
        <div class="doc-actions">
          <span class="status-badge status-${a.status}">${statusLabel(a.status)}</span>
          ${a.status === 'pending' ? `
            <button class="btn-confirm"  onclick="updateApptStatus(${a.id},'confirmed')">✅ Confirm</button>
            <button class="btn-reject"   onclick="updateApptStatus(${a.id},'cancelled')">❌ Reject</button>
          ` : ''}
          ${a.status === 'confirmed' ? `
            <button class="btn-complete" onclick="updateApptStatus(${a.id},'completed')">🏁 Mark Completed</button>
            <button class="btn-reject"   onclick="updateApptStatus(${a.id},'cancelled')">❌ Cancel</button>
          ` : ''}
        </div>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = '<div class="empty-state">⚠️ Could not load appointments.</div>';
  }
}

async function updateApptStatus(id, status) {
  const labels = { confirmed:'Confirm', cancelled:'Cancel/Reject', completed:'Mark as Completed' };
  if (!confirm(`Are you sure you want to ${labels[status] || status} this appointment?`)) return;

  try {
    const res = await fetch(`${API}/api/appointments/status/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    if (res.ok) {
      alert(`✅ Appointment ${status}!`);
      loadDoctorAppointments();
    }
  } catch (err) {
    alert('Error updating status.');
  }
}

function switchDocTab(tab) {
  currentDocTab = tab;
  document.querySelectorAll('.doc-tab').forEach(t => t.classList.remove('active'));
  event.target.classList.add('active');
  loadDoctorAppointments();
}

async function toggleMyAvailability() {
  if (!myDoctorId) return;
  const btn       = document.getElementById('docAvailBtn');
  const isAvail   = btn.classList.contains('btn-avail-on');
  const newStatus = !isAvail;

  try {
    const res = await fetch(`${API}/api/doctors/availability/${myDoctorId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ available: newStatus })
    });
    if (res.ok) {
      btn.className   = newStatus ? 'btn-avail-on' : 'btn-avail-off';
      btn.textContent = newStatus ? '✅ Available' : '❌ Unavailable';
      alert(`You are now marked as ${newStatus ? 'Available ✅' : 'Unavailable ❌'}`);
    }
  } catch (err) {
    alert('Error updating availability.');
  }
}

// ===== RATING =====
let ratingData = { doctorId: null, doctorName: '', appointmentId: null, stars: 0 };

function openRateModal(doctorId, doctorName, appointmentId) {
  ratingData = { doctorId, doctorName, appointmentId, stars: 0 };
  document.getElementById('rateModalTitle').textContent = `Rate Dr. ${doctorName}`;
  document.getElementById('ratingError').textContent    = '';
  document.getElementById('ratingComment').value        = '';
  highlightStars(0);
  openModal('rateModal');
}

function highlightStars(count) {
  document.querySelectorAll('.star-btn').forEach((s, i) => {
    s.textContent = i < count ? '⭐' : '☆';
  });
  ratingData.stars = count;
}

async function submitRating() {
  const comment = document.getElementById('ratingComment').value.trim();
  const errEl   = document.getElementById('ratingError');
  if (!ratingData.stars) { errEl.textContent = 'Please select a star rating.'; return; }

  try {
    const res = await fetch(`${API}/api/doctors/rate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patient_id:     currentUser.id,
        doctor_id:      ratingData.doctorId,
        appointment_id: ratingData.appointmentId,
        rating:         ratingData.stars,
        comment
      })
    });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error; return; }
    alert(`✅ Thanks for rating Dr. ${ratingData.doctorName}!`);
    closeModal('rateModal');
    loadAppointments();
    loadDoctors();
  } catch (err) {
    errEl.textContent = 'Network error.';
  }
}

// ===== EMERGENCY SOS =====
async function sendSOS() {
  const description = document.getElementById('emergencyDesc').value.trim();
  const errEl       = document.getElementById('emergencyError');
  if (!description) { errEl.textContent = 'Please describe your emergency.'; return; }

  const btn = document.querySelector('#emergencyModal .btn-sos-big');
  btn.textContent = 'Sending alert...';
  btn.disabled    = true;

  try {
    const res  = await fetch(`${API}/api/emergency/sos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patient_id: currentUser?.id || 1, description })
    });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error; return; }
    closeModal('emergencyModal');
    alert(`🚨 Emergency alert sent!\n✅ ${data.doctors_alerted} doctor(s) notified.\n⏱ Expected response: ${data.response_time}`);
    document.getElementById('emergencyDesc').value = '';
  } catch (err) {
    errEl.textContent = '⚠️ Network error. Is the server running?';
  } finally {
    btn.textContent = '🚨 Send Emergency Alert Now';
    btn.disabled    = false;
  }
}