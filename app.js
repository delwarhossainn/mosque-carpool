/* Mosque Carpool — frontend (vanilla JS, mobile-first) */
const S = {
  token: localStorage.getItem('mc_token'),
  user: null, mosques: [], mode: 'login',
  poll: null, online: false, quoteTimer: null,
};
const FALLBACK = { lat: 49.8951, lng: -97.1384 }; // downtown Winnipeg

const QUOTES = [
  ["Whoever relieves a believer's distress of the distressful aspects of this world, Allah will rescue him from a difficulty of the difficulties of the Hereafter.", "Sahih Muslim"],
  ["The best of people are those who are most beneficial to others.", "Hadith"],
  ["Want to give a brother a ride to the mosque? Go online!", "Mosque Carpool"],
  ["A sister helping a sister to Fajr — what better deed on a cold Winnipeg morning?", "Mosque Carpool"],
  ["The most beloved deeds to Allah are the most consistent, even if small.", "Sahih al-Bukhari"],
  ["Whoever guides someone to goodness will have a reward like the one who did it.", "Sahih Muslim"],
];

async function api(path, data) {
  const res = await fetch('api/' + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json',
      ...(S.token ? { 'Authorization': 'Bearer ' + S.token } : {}) },
    body: JSON.stringify(data || {}),
  });
  const j = await res.json().catch(() => ({ ok: false, error: 'Server error' }));
  if (!j.ok && (res.status === 401)) { doLogout(true); }
  return j;
}
const $ = id => document.getElementById(id);

function show(id) {
  stopPoll();
  document.querySelectorAll('.screen').forEach(e => e.classList.remove('active'));
  $('s-' + id).classList.add('active');
  document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
  if (id === 'notifs') loadNotifs();
  if (id === 'profile') renderProfile();
  window.scrollTo(0, 0);
}

function stopPoll() { if (S.poll) { clearInterval(S.poll); S.poll = null; } }

function rotateQuote() {
  const q = QUOTES[Math.floor(Math.random() * QUOTES.length)];
  $('quoteBox').innerHTML = `"${q[0]}"<b>— ${q[1]}</b>`;
}

/* ---------- auth ---------- */
function toggleAuth() {
  S.mode = S.mode === 'login' ? 'signup' : 'login';
  const su = S.mode === 'signup';
  $('authTitle').textContent = su ? 'Create account' : 'Sign in';
  $('authBtn').textContent = su ? 'Sign up' : 'Sign in';
  $('authSwitch').textContent = su ? 'Have an account? Sign in' : 'New here? Create an account';
  $('signupFields').classList.toggle('hidden', !su);
  $('signupFields2').classList.toggle('hidden', !su);
}
$('su_car')?.addEventListener('change', e => $('carBox').classList.toggle('hidden', !e.target.checked));

async function doAuth() {
  const email = $('email').value.trim(), pw = $('pw').value;
  if (S.mode === 'signup') {
    const r = await api('signup.php', {
      name: $('su_name').value.trim(), email, password: pw,
      gender: $('su_gender').value,
      has_car: $('su_car').checked ? 1 : 0,
      car_details: $('su_cardet').value.trim(),
    });
    if (!r.ok) return alert(r.error);
    S.token = r.token; localStorage.setItem('mc_token', r.token);
    enter(r.user);
  } else {
    const r = await api('login.php', { email, password: pw });
    if (!r.ok) return alert(r.error);
    S.token = r.token; localStorage.setItem('mc_token', r.token);
    enter(r.user);
  }
}

async function doLogout(silent) {
  try { if (S.token) await api('logout.php', {}); } catch (e) {}
  S.token = null; S.user = null; S.online = false;
  localStorage.removeItem('mc_token'); stopPoll();
  $('tabbar').classList.add('hidden');
  if (!silent) { toggleReset(); show('auth'); }
}
function toggleReset() {
  if (S.mode === 'signup') toggleAuth();
  $('email').value = ''; $('pw').value = '';
}

async function enter(user) {
  S.user = user;
  const r = await api('mosques.php', {});
  S.mosques = r.ok ? r.mosques : [];
  const opts = S.mosques.map(m =>
    `<option value="${m.id}">${m.name} — ${m.address}</option>`).join('');
  $('r_mosque').innerHTML = opts; $('d_mosque').innerHTML = opts;
  $('tabbar').classList.remove('hidden');
  $('tab-driver').classList.toggle('hidden', !user.has_car);
  rotateQuote();
  if (S.quoteTimer) clearInterval(S.quoteTimer);
  S.quoteTimer = setInterval(rotateQuote, 12000);
  refreshBadge();
  goHome();
}

async function refreshBadge() {
  const r = await api('me.php', {});
  if (r.ok) {
    S.user = r.user;
    const n = r.user.unread_notifications;
    $('bellBadge').textContent = n;
    $('bellBadge').classList.toggle('hidden', !n);
  }
}

function goHome() {
  document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
  $('tab-rider').classList.add('active');
  show('rider');
}

/* ---------- location ---------- */
function getPos() {
  return new Promise(res => {
    if (!navigator.geolocation) return res(FALLBACK);
    navigator.geolocation.getCurrentPosition(
      p => res({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => res(FALLBACK), { timeout: 8000 });
  });
}

/* ---------- rider flow ---------- */
async function requestRide() {
  const mid = parseInt($('r_mosque').value);
  const pos = await getPos();
  const r = await api('request_ride.php', {
    mosque_id: mid, lat: pos.lat, lng: pos.lng, note: $('r_note').value.trim(),
  });
  if (!r.ok) return alert(r.error);
  $('w_info').textContent = r.drivers_online > 0
    ? `${r.drivers_online} driver${r.drivers_online > 1 ? 's' : ''} online for ${r.mosque} — hang tight.`
    : `No drivers online for ${r.mosque} right now — your request is waiting for one.`;
  show('waiting');
  stopPoll();
  S.poll = setInterval(pollRiderTrip, 8000);
  pollRiderTrip();
}

async function pollRiderTrip() {
  const r = await api('my_trip.php', {});
  if (!r.ok || !r.trip) { goHome(); return; }
  if (r.trip.role === 'rider' && r.trip.status === 'accepted') {
    stopPoll();
    $('ra_name').textContent = r.trip.driver_name;
    $('ra_car').textContent = r.trip.car_details || '—';
    $('ra_eta').textContent = '~' + r.trip.eta_min + ' min';
    $('ra_mosque').textContent = r.trip.mosque_name;
    $('ra_code').textContent = r.trip.pickup_code;
    $('ra_maps').href = r.trip.maps_url;
    show('racc');
    // keep watching until the driver completes the trip
    S.poll = setInterval(async () => {
      const t = await api('my_trip.php', {});
      if (t.ok && !t.trip) { stopPoll(); alert('Trip completed. JazakAllah khair! 🤲'); goHome(); }
    }, 15000);
  }
}

async function cancelRide() {
  const t = await api('my_trip.php', {});
  if (t.ok && t.trip && t.trip.role === 'rider') {
    await api('cancel_request.php', { request_id: t.trip.request_id });
  }
  goHome();
}

/* ---------- driver flow ---------- */
async function toggleOnline() {
  if (!S.online) {
    const mid = parseInt($('d_mosque').value);
    if (!mid) return alert('Choose a mosque first.');
    const pos = await getPos();
    const r = await api('driver_status.php', { online: 1, mosque_id: mid, lat: pos.lat, lng: pos.lng });
    if (!r.ok) return alert(r.error);
    S.online = true;
    $('goBtn').classList.add('on'); $('goBtn').innerHTML = 'ONLINE<br>🟢';
    $('d_status').textContent = 'You are online — riders can now request you.';
    $('d_mosqueBox').classList.add('hidden');
    stopPoll();
    S.poll = setInterval(pollDriver, 10000);
    pollDriver();
  } else {
    await api('driver_status.php', { online: 0 });
    S.online = false;
    $('goBtn').classList.remove('on'); $('goBtn').innerHTML = 'GO<br>ONLINE';
    $('d_status').textContent = 'You are offline.';
    $('d_mosqueBox').classList.remove('hidden');
    $('d_queue').innerHTML = '';
    stopPoll();
  }
}

async function pollDriver() {
  // first: do I have an accepted trip?
  const t = await api('my_trip.php', {});
  if (t.ok && t.trip && t.trip.role === 'driver') { stopPoll(); renderDriverTrip(t.trip); return; }
  const r = await api('driver_requests.php', {});
  if (!r.ok) return;
  const q = $('d_queue');
  if (!r.requests.length) {
    q.innerHTML = `<div class="card"><p class="center">No requests right now. Stay online — riders will appear here.</p></div>`;
    return;
  }
  q.innerHTML = '<div class="card"><h2>Incoming requests (' + r.requests.length + ')</h2></div>' +
    r.requests.map(x => `
    <div class="card req">
      <div class="meta"><span>Rider</span><b>${esc(x.rider_name)}</b></div>
      <div class="meta"><span>Distance</span><b class="dist">${x.dist_km} km away</b></div>
      ${x.note ? `<p>"${esc(x.note)}"</p>` : ''}
      <div class="row2">
        <button class="btn" onclick="respondReq(${x.id},1)">Accept ✅</button>
        <button class="btn secondary" onclick="respondReq(${x.id},0)">Decline</button>
      </div>
    </div>`).join('');
}

async function respondReq(id, accept) {
  const r = await api('respond_request.php', { request_id: id, accept });
  if (!r.ok) { alert(r.error); pollDriver(); return; }
  if (accept) {
    const t = await api('my_trip.php', {});
    if (t.ok && t.trip) { stopPoll(); renderDriverTrip(t.trip); }
  } else pollDriver();
}

function renderDriverTrip(t) {
  $('dt_name').textContent = t.rider_name;
  $('dt_mosque').textContent = t.mosque_name;
  $('dt_code').textContent = t.pickup_code;
  $('dt_maps').href = t.maps_url;
  $('dt_maps').dataset.req = t.request_id;
  show('dtrip');
}

async function completeTrip() {
  const id = parseInt($('dt_maps').dataset.req);
  const r = await api('complete_trip.php', { request_id: id });
  if (!r.ok) return alert(r.error);
  alert('Trip completed. May Allah accept it from you! 🤲');
  show('driver');
  stopPoll();
  S.poll = setInterval(pollDriver, 10000);
  pollDriver();
}

function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

/* ---------- notifications / profile ---------- */
async function loadNotifs() {
  const r = await api('notifications.php', {});
  if (!r.ok) return;
  $('notifList').innerHTML = r.notifications.length
    ? r.notifications.map(n => `<div class="meta"><span>${esc(n.created_at.slice(0,16).replace('T',' '))}</span><b>${esc(n.title)}</b></div><p>${esc(n.body)}</p>`).join('')
    : '<p>No notifications yet.</p>';
  api('mark_read.php', {}).then(refreshBadge);
}

function renderProfile() {
  $('p_name').textContent = S.user.name;
  $('p_email').textContent = S.user.email;
  $('p_car').textContent = S.user.has_car ? ('Yes — ' + (S.user.car_details || 'car registered')) : 'Rider only';
}

/* ---------- boot ---------- */
(async function boot() {
  rotateQuote();
  if (S.token) {
    const r = await api('me.php', {});
    if (r.ok) enter(r.user); else { doLogout(true); show('auth'); }
  } else show('auth');
})();
