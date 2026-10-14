/* Mosque Carpool — frontend wired to the PHP/MySQL backend.
   Same look and flow as the original prototype; every action below
   talks to api/*.php instead of simulated data. */
'use strict';

/* ---------- tiny helpers (kept from the original) ---------- */
const $  = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
function toast(msg){
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(()=>el.classList.remove('show'), 2600);
}
function showScreen(name){
  $$('.screen').forEach(x=>x.classList.toggle('active', x.dataset.screen===name));
  $$('.nav-btn').forEach(x=>x.classList.toggle('active', x.dataset.go===name));
  window.scrollTo({top:0, behavior:'smooth'});
}
function choiceGroup(id, cb){
  const root = $(id);
  if(!root) return;
  root.addEventListener('click', e=>{
    const b = e.target.closest('.choice');
    if(!b) return;
    e.preventDefault();
    [...root.children].forEach(x=>x.classList.remove('selected'));
    b.classList.add('selected');
    cb && cb(b.dataset.value);
  });
}
function selectedValue(id){
  return $(id+' .selected')?.dataset.value || null;
}
function esc(s){
  return String(s ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/* ---------- state ---------- */
const state = {
  token: localStorage.getItem('mc_token') || null,
  user: null,
  mosques: [],
  riderCoords: null,
  riderPoll: null,
  driverPoll: null,
  driverOnline: false,
  activeRequestId: null,
  pendingAction: null,
};

/* Live trip view handles (driver + rider). */
let riderTripView = null;   // {phase:'pickup'|'mosque', map}
let driverTrip = null;      // {request_id}
let driverTripView = null;  // {phase:'pickup'|'mosque', map}
let driverLocTimer = null;

/* Fallback mosque directory (DB ids 1..14, seed order) if the API is unreachable. */
const FALLBACK_MOSQUES = [
  {id:1,  label:'Manitoba Islamic Association — Grand Mosque', address:'2445 Waverley St', lat:49.7914428, lng:-97.1749375},
  {id:2,  label:'Winnipeg Central Mosque', address:'715 Ellice Ave', lat:49.8932488, lng:-97.1644922},
  {id:3,  label:'Salam Masjid', address:'294 Burrows Ave', lat:49.9156197, lng:-97.1348114},
  {id:4,  label:'Masjid Bilal — Winnipeg Islamic Centre', address:'33 Warnock St', lat:49.9137890, lng:-97.1677903},
  {id:5,  label:'ICNA Centre & Mosque', address:"426 St Anne's Rd", lat:49.8459557, lng:-97.0976442},
  {id:6,  label:'Pakistan Centre Masjid', address:'348 Ross Ave', lat:49.9018270, lng:-97.1424600},
  {id:7,  label:'MIA Connections', address:'406 Edmonton St', lat:49.8960213, lng:-97.1495499},
  {id:8,  label:'University of Winnipeg Prayer Space', address:'Graham Hall, 515 Portage Ave', lat:49.8905686, lng:-97.1532053},
  {id:9,  label:'Pioneer Mosque', address:'247 Hazelwood Ave', lat:49.8266900, lng:-97.1013800},
  {id:10, label:'Madinah Masjid', address:'431C Thames Ave', lat:49.9090100, lng:-97.1019800},
  {id:11, label:'Faizan-e-Madina Winnipeg', address:"585 St Anne's Rd", lat:49.8337000, lng:-97.0897000},
  {id:12, label:'Islamic Educational Foundation', address:'731 Wellington Ave', lat:49.9003400, lng:-97.1649600},
  {id:13, label:'Jamia Masjid Abobakar Siddique & Community Centre', address:'794 Ellice Ave', lat:49.8930000, lng:-97.1678900},
  {id:14, label:'Yaseen Centre of Manitoba', address:'746 Ellice Ave', lat:49.8930030, lng:-97.1655930},
];

/* ---------- API ---------- */
async function api(path, opts={}){
  const headers = {'Content-Type':'application/json'};
  if(state.token) headers['Authorization'] = 'Bearer '+state.token;
  const res = await fetch('api/'+path, {
    method: opts.method || 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(()=>({ok:false, error:'Network error'}));
  if(!data.ok) throw new Error(data.error || 'Request failed');
  return data;
}
function mosqueById(id){ return state.mosques.find(m=>m.id===+id); }
function directionsUrl(lat, lng){
  return 'https://www.google.com/maps/dir/?api=1&destination='+lat+','+lng;
}

/* ---------- trip tracking maps (MapLibre + OSRM driving route) ---------- */
async function fetchRoute(aLng, aLat, bLng, bLat){
  try{
    const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${aLng},${aLat};${bLng},${bLat}?overview=full&geometries=geojson`);
    const j = await r.json();
    if(j.code==='Ok' && j.routes && j.routes[0]) return j.routes[0].geometry.coordinates;
  }catch(e){}
  return [[aLng,aLat],[bLng,bLat]]; // straight-line fallback
}
function tripMapStyle(){
  return matchMedia('(prefers-color-scheme: dark)').matches
    ? 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
    : 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';
}
/* Mounts a live trip map. Returns {moveDriver(lat,lng), destroy()} or null. */
function mountTripMap(boxId, driver, target){
  const box = document.getElementById(boxId);
  if(!box || !window.maplibregl) return null;
  try{
    const map = new maplibregl.Map({
      container: box, style: tripMapStyle(),
      center: [(driver.lng+target.lng)/2, (driver.lat+target.lat)/2], zoom: 12,
    });
    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    const mk = (cls, emoji, lng, lat, label)=>{
      const el = document.createElement('div');
      el.className = 'trip-marker '+cls;
      el.textContent = emoji;
      return new maplibregl.Marker({element: el}).setLngLat([lng,lat])
        .setPopup(new maplibregl.Popup({offset:22}).setHTML(`<strong>${esc(label)}</strong>`))
        .addTo(map);
    };
    const dMarker = mk('driver', '🚗', driver.lng, driver.lat, driver.label || 'Driver');
    mk('target', '📍', target.lng, target.lat, target.label || 'Destination');
    map.on('load', async ()=>{
      const coords = await fetchRoute(driver.lng, driver.lat, target.lng, target.lat);
      const id = 'trip-route-'+boxId;
      if(map.getSource(id)) return;
      map.addSource(id, {type:'geojson', data:{type:'Feature', properties:{}, geometry:{type:'LineString', coordinates:coords}}});
      map.addLayer({id, type:'line', source:id, paint:{'line-color':'#17643a','line-width':5,'line-opacity':0.85}});
      const b = new maplibregl.LngLatBounds();
      coords.forEach(c=>b.extend(c));
      map.fitBounds(b, {padding:55});
    });
    return {
      moveDriver(lat,lng){ dMarker.setLngLat([lng,lat]); },
      destroy(){ map.remove(); },
    };
  }catch(e){ return null; }
}

/* ---------- auth ---------- */
function updateDriveTab(){
  const tab = $('#driveTab');
  if(!tab) return;
  const isDriver = !!(state.user && state.user.has_car);
  tab.style.display = isDriver ? '' : 'none';
  // If a rider somehow lands on drive screen, bounce them home.
  if(!isDriver && document.querySelector('.screen[data-screen="drive"]').classList.contains('active')){
    showScreen('home');
  }
}
function setSession(token, user){
  state.token = token;
  state.user = user;
  if(token) localStorage.setItem('mc_token', token);
  else localStorage.removeItem('mc_token');
  $('#pageTitle').textContent = user ? ('Salaam, '+user.name.split(' ')[0]+' 👋') : 'Salaam 👋';
  updateDriveTab();
  if(user){ startNotifPoll(); setupPush(); } else stopNotifPoll();
  // Prayer hint based on time of day.
  const ph = $('#prayerHint');
  if(ph){
    const h = new Date().getHours();
    ph.textContent = h < 5 ? 'Fajr' : h < 12 ? 'Dhuhr' : h < 16 ? 'Asr' : h < 19 ? 'Maghrib' : 'Isha';
  }
}
function openAuth(tab){
  $('#authForms').hidden = false;
  $('#accountPane').hidden = true;
  $('#authTitle').textContent = 'Welcome';
  setAuthTab(tab || 'signin');
  $('#authDialog').showModal();
}
function setAuthTab(tab){
  $$('#authTabs .choice').forEach(x=>x.classList.toggle('selected', x.dataset.value===tab));
  $('#signinPane').hidden = tab!=='signin';
  $('#signupPane').hidden = tab!=='signup';
}
function openAccount(){
  $('#authForms').hidden = true;
  $('#accountPane').hidden = false;
  $('#authTitle').textContent = 'Your account';
  const u = state.user;
  $('#accName').textContent = u.name;
  $('#accMeta').textContent = u.email+' · '+(u.gender==='female'?'Sister':'Brother')+(u.has_car?' · Driver':' · Rider');
  const av = $('#accAvatar');
  if(av) av.textContent = (u.name||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
  // Riders can convert to drivers.
  const bdBox = $('#becomeDriverBox');
  if(bdBox) bdBox.hidden = !!u.has_car;
  $('#authDialog').showModal();
}
$('#becomeDriverBtn')?.addEventListener('click', async ()=>{
  const btn = $('#becomeDriverBtn');
  btn.disabled = true;
  try{
    await api('become_driver.php', {method:'POST', body:{
      vehicle: $('#bdVehicle').value.trim(),
      plate: $('#bdPlate').value.trim(),
    }});
    // Refresh user from server.
    const me = await api('me.php');
    state.user = me.user;
    updateDriveTab();
    openAccount(); // re-render with driver status
    toast('You can now offer rides! Check the Drive tab.');
  }catch(e){ toast(e.message); }
  finally{ btn.disabled = false; }
});
function requireAuth(action){
  if(state.user) return true;
  state.pendingAction = action || null;
  openAuth('signin');
  return false;
}
function afterAuth(){
  if(state.pendingAction){
    const a = state.pendingAction;
    state.pendingAction = null;
    goAction(a);
  }
}

async function doLogin(){
  const email = $('#loginEmail').value.trim();
  const password = $('#loginPassword').value;
  if(!email || !password){ toast('Enter your email and password.'); return; }
  try{
    const d = await api('login.php', {method:'POST', body:{email, password}});
    setSession(d.token, d.user);
    $('#authDialog').close();
    toast('Welcome back, '+d.user.name.split(' ')[0]+'.');
    syncDriverUI(d.user);
    afterAuth();
  }catch(e){ toast(e.message); }
}
async function doSignup(){
  const name = $('#suName').value.trim();
  const email = $('#suEmail').value.trim();
  const password = $('#suPassword').value;
  const gender = selectedValue('#genderChoice');
  const car = selectedValue('#carChoice');
  if(!name || !email || !password || !gender || !car){ toast('Complete each field to continue.'); return; }
  if(password.length < 6){ toast('Password must be at least 6 characters.'); return; }
  const vehicle = $('#vehicle').value.trim();
  const plate = $('#plate').value.trim();
  const car_details = [vehicle, plate ? ('Plate ending '+plate) : ''].filter(Boolean).join(' · ');
  try{
    const d = await api('signup.php', {method:'POST', body:{
      name, email, password, gender,
      has_car: car==='yes' ? 1 : 0,
      car_details,
    }});
    setSession(d.token, d.user);
    $('#authDialog').close();
    toast('Account created. Salaam, '+d.user.name.split(' ')[0]+'!');
    afterAuth();
  }catch(e){ toast(e.message); }
}
async function doLogout(){
  try{ await api('logout.php', {method:'POST'}); }catch(e){}
  stopAllPolling();
  setSession(null, null);
  resetRideUI();
  setDriverOfflineUI();
  $('#authDialog').close();
  toast('Signed out.');
}

/* ---------- navigation (original behaviour) ---------- */
function goAction(action){
  if(!requireAuth(action)) return;
  if(action==='request') showScreen('ride');
  if(action==='drive'){
    showScreen('drive');
    if(!state.user.has_car) toast('Rider-only profiles cannot receive ride requests.');
  }
}
$$('[data-go]').forEach(b=>b.addEventListener('click', ()=>showScreen(b.dataset.go)));
$$('[data-action]').forEach(b=>b.addEventListener('click', ()=>goAction(b.dataset.action)));
$('#profileBtn').addEventListener('click', ()=>{ state.user ? openAccount() : openAuth('signin'); });
$$('[data-close]').forEach(b=>b.addEventListener('click', ()=>$('#authDialog').close()));

/* ---------- mosques + map ---------- */
async function loadMosques(){
  try{
    const d = await api('mosques.php');
    state.mosques = d.mosques.map(m=>({id:+m.id, label:m.name, address:m.address||'', lat:+m.lat, lng:+m.lng}));
  }catch(e){
    state.mosques = FALLBACK_MOSQUES;
  }
  const opts = state.mosques.map(m=>`<option value="${m.id}">${esc(m.label)}</option>`).join('');
  $('#rideMosque').innerHTML = opts;
  $('#driveMosque').innerHTML = opts;
  updateDirections();
  mountMap();
}
function updateDirections(){
  const m = mosqueById($('#rideMosque').value);
  const a = $('#rideDirections');
  if(m){ a.href = directionsUrl(m.lat, m.lng); a.style.display='inline-flex'; }
  else { a.href='#'; a.style.display='none'; }
}
function mapFallback(){
  const box = $('#homeMap');
  box.innerHTML = '<div class="map-fallback"><div><strong>Map unavailable</strong><p>Choose a mosque from the destination list below and open directions in your maps app.</p></div></div>';
}
function mountMap(){
  const box = $('#homeMap');
  // Mosque strip cards (horizontal scroll).
  const strip = $('#mosqueStrip');
  if(strip){
    strip.innerHTML = state.mosques.map((m,i)=>{
      const url = directionsUrl(m.lat, m.lng);
      return `<div class="mosque-card" data-mosque="${i}"><div class="m-icon">🕌</div><h3>${esc(m.label)}</h3><p>${esc(m.address)}</p><a href="${url}" target="_blank" rel="noopener" class="m-dist" onclick="event.stopPropagation()">Directions →</a></div>`;
    }).join('');
    const mc = $('#mosqueCount');
    if(mc) mc.textContent = state.mosques.length + ' mosques';
  }

  if(!window.maplibregl){ mapFallback(); return; }
  try{
    const dark = matchMedia('(prefers-color-scheme: dark)').matches;
    const map = new maplibregl.Map({
      container: box,
      style: dark ? 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
                  : 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
      center: [-97.14, 49.895],
      zoom: 10.5,
    });
    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    state.mosques.forEach((m,i)=>{
      const el = document.createElement('div');
      el.className = 'mosque-marker';
      el.textContent = String(i+1);
      new maplibregl.Marker({element: el})
        .setLngLat([m.lng, m.lat])
        .setPopup(new maplibregl.Popup({offset: 20}).setHTML(`<strong>${esc(m.label)}</strong><br>${esc(m.address)}`))
        .addTo(map);
    });
    // Strip cards fly the map to the mosque.
    if(strip){
      strip.querySelectorAll('.mosque-card').forEach(card=>{
        card.style.cursor = 'pointer';
        card.addEventListener('click', ()=>{
          const m = state.mosques[+card.dataset.mosque];
          if(m) map.flyTo({center:[m.lng, m.lat], zoom:14});
        });
      });
    }
  }catch(e){ mapFallback(); }
}

/* ---------- rider flow ---------- */
function getPosition(){
  return new Promise((resolve, reject)=>{
    if(!navigator.geolocation) return reject(new Error('no geo'));
    navigator.geolocation.getCurrentPosition(resolve, reject, {enableHighAccuracy:false, timeout:8000});
  });
}
$('#locateBtn').addEventListener('click', async ()=>{
  $('#locationStatus').textContent = 'Requesting location permission…';
  try{
    const pos = await getPosition();
    state.riderCoords = {lat: pos.coords.latitude, lng: pos.coords.longitude};
    $('#pickup').value = 'Current location';
    $('#locationStatus').textContent = 'Location ready. It stays hidden until a driver accepts.';
    toast('Current location added.');
  }catch(e){
    $('#locationStatus').textContent = 'Location was not shared. Enter an intersection or area instead.';
  }
});
$('#rideMosque').addEventListener('change', updateDirections);

$('#sendRequest').addEventListener('click', async ()=>{
  if(!requireAuth('request')) return;
  const pickupText = $('#pickup').value.trim();
  if(!pickupText && !state.riderCoords){ toast('Add a pickup area or use your current location.'); return; }
  const mosqueId = +$('#rideMosque').value;
  const win = selectedValue('#rideWindow') || 'Fajr';
  const seats = $('#riders').value;
  const note = [pickupText, win+' window', seats].filter(Boolean).join(' · ');
  try{
    const d = await api('request_ride.php', {method:'POST', body:{
      mosque_id: mosqueId,
      lat: state.riderCoords ? state.riderCoords.lat : 0,
      lng: state.riderCoords ? state.riderCoords.lng : 0,
      note,
    }});
    state.activeRequestId = d.request_id;
    $('#rideEmpty').hidden = true;
    $('#acceptedState').hidden = true;
    $('#matchingState').hidden = false;
    if(d.drivers_online === 0) toast('Request sent — no drivers online for this mosque yet.');
    startRiderPoll();
  }catch(e){ toast(e.message); }
});

function startRiderPoll(){
  stopRiderPoll();
  state.riderPoll = setInterval(pollRiderTrip, 4000);
  pollRiderTrip();
}
function stopRiderPoll(){ clearInterval(state.riderPoll); state.riderPoll = null; }

/* ---------- web push notifications ---------- */
const VAPID_PUBLIC_KEY = 'BKuno4H_1ux8FL65l3cnHwY0NjNWpgICOeyoMFh__HcXIQs96W0ki_kmWYZsq4oN3gsQndG3fXyCqY8bMPRPOy8';
function urlBase64ToUint8Array(base64String){
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for(let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}
async function setupPush(){
  if(!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  try{
    const reg = await navigator.serviceWorker.register('sw.js');
    // Only prompt if not already decided.
    if(Notification.permission === 'default' && state.user){
      const granted = await Notification.requestPermission();
      if(granted !== 'granted') return;
    }
    if(Notification.permission !== 'granted') return;

    let sub = await reg.pushManager.getSubscription();
    if(!sub){
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }
    // Send to backend.
    const json = sub.toJSON();
    await api('save_subscription.php', {method:'POST', body:{
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
    }});
  }catch(e){
    // Push is optional; failures are silent.
    console.warn('Push setup failed:', e);
  }
}

/* ---------- notifications ---------- */
let notifPoll = null;
let lastNotifId = 0;
function startNotifPoll(){
  stopNotifPoll();
  notifPoll = setInterval(pollNotifications, 8000);
  pollNotifications();
}
function stopNotifPoll(){ clearInterval(notifPoll); notifPoll = null; }
async function pollNotifications(){
  if(!state.user) return;
  try{
    const d = await api('notifications.php');
    const badge = $('#notifBadge');
    if(badge){
      if(d.unread > 0){
        badge.hidden = false;
        badge.textContent = d.unread > 99 ? '99+' : d.unread;
      }else badge.hidden = true;
    }
    // Toast for brand-new notifications (skip on first load).
    const items = d.notifications || [];
    if(lastNotifId > 0){
      const fresh = items.filter(n => n.id > lastNotifId && n.is_read == 0);
      for(const n of fresh.slice(0, 2)) toast(n.title + ' — ' + n.body);
    }
    if(items.length) lastNotifId = Math.max(lastNotifId, ...items.map(n => n.id));
  }catch(e){ /* transient */ }
}
$('#notifBtn')?.addEventListener('click', async ()=>{
  const list = $('#notifList');
  list.innerHTML = '<div class="skel" style="height:70px"></div><div class="skel" style="height:70px"></div>';
  $('#notifDialog').showModal();
  try{
    const d = await api('notifications.php');
    const items = d.notifications || [];
    list.innerHTML = items.length ? items.map(n => `
      <div class="notif-item${n.is_read==0?' unread':''}">
        <h4>${esc(n.title)}</h4>
        <p>${esc(n.body)}</p>
        <time>${esc(n.created_at)}</time>
      </div>`).join('')
      : '<div class="notif-empty">No notifications yet.</div>';
    // Mark all as read.
    if(d.unread > 0){
      await api('mark_read.php', {method:'POST'});
      const badge = $('#notifBadge');
      if(badge) badge.hidden = true;
    }
  }catch(e){
    list.innerHTML = '<div class="notif-empty">Could not load notifications.</div>';
  }
});

async function pollRiderTrip(){
  try{
    const d = await api('my_trip.php');
    const t = d.rider_trip;
    if(!t){
      stopRiderPoll();
      const wasInTrip = !!riderTripView;
      resetRideUI();
      if(wasInTrip) toast('Trip completed. JazakAllah khair!');
      return;
    }
    if(t.status==='accepted' || t.status==='picked_up') renderRiderTrip(t);
    else if(t.status==='pending' && riderTripView){
      // Driver went offline mid-pickup: request is back in the queue.
      resetRideUI();
      $('#rideEmpty').hidden = true;
      $('#matchingState').hidden = false;
      toast('Your driver went offline — your request is back in the queue.');
    }
    // pending otherwise: keep the "looking" UI
  }catch(e){ /* transient — keep polling */ }
}
function initials(name){ return name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase(); }

/* Rider's live trip view: driver tracking map, pickup code, then ride map. */
function renderRiderTrip(t, silent){
  const phase = t.ride_started ? 'mosque' : 'pickup';
  if(riderTripView && riderTripView.phase===phase){
    // Same phase — just move the driver marker and refresh the ETA.
    if(riderTripView.map && t.driver_lat!=null) riderTripView.map.moveDriver(t.driver_lat, t.driver_lng);
    const eta = $('#riderEta');
    if(eta && t.eta_min) eta.textContent = 'About '+t.eta_min+' min';
    return;
  }
  if(riderTripView && riderTripView.map) riderTripView.map.destroy();
  $('#matchingState').hidden = true;
  $('#rideEmpty').hidden = true;
  const c = $('#acceptedContent');
  if(phase==='pickup'){
    c.innerHTML = `
      <p class="eyebrow">Driver accepted</p><h2>Your driver is on the way</h2>
      <div class="trip-map-wrap"><div class="map-shell"><div id="riderTripMap" class="map"></div></div></div>
      <div class="driver-card card" style="margin-top:12px">
        <div class="driver-head"><div class="avatar">${esc(initials(t.driver_name))}</div><div><h3 style="margin:0">${esc(t.driver_name)}</h3><span class="verified">Same-gender match</span></div></div>
        <div class="request-meta">
          ${t.car_details?`<span class="chip">${esc(t.car_details)}</span>`:''}
          <span class="chip" id="riderEta">About ${t.eta_min} min</span>
        </div>
        <div class="trip-code"><span>Show this code to your driver</span><strong>${esc(t.pickup_code)}</strong><small>One-time pickup code</small></div>
        <button class="btn btn-danger-ghost btn-block" id="riderCancelBtn" style="margin-top:14px">Cancel ride</button>
      </div>`;
  }else{
    c.innerHTML = `
      <p class="eyebrow">Ride started</p><h2>On the way to ${esc(t.mosque_name)}</h2>
      <div class="trip-map-wrap"><div class="map-shell"><div id="riderTripMap" class="map"></div></div></div>
      <div class="driver-card card" style="margin-top:12px">
        <div class="driver-head"><div class="avatar">${esc(initials(t.driver_name))}</div><div><h3 style="margin:0">${esc(t.driver_name)}</h3><span class="verified">Same-gender match</span></div></div>
        ${t.maps_url?`<a class="btn secondary full" style="margin-top:6px" href="${esc(t.maps_url)}" target="_blank" rel="noopener">Open route in maps</a>`:''}
      </div>`;
  }
  $('#acceptedState').hidden = false;
  const dPos = (t.driver_lat!=null && t.driver_lng!=null)
    ? {lat:t.driver_lat, lng:t.driver_lng} : {lat:t.pickup_lat, lng:t.pickup_lng};
  const target = phase==='pickup'
    ? {lat:t.pickup_lat, lng:t.pickup_lng, label:'Your pickup'}
    : {lat:t.mosque_lat, lng:t.mosque_lng, label:t.mosque_name};
  const map = mountTripMap('riderTripMap', {lat:dPos.lat, lng:dPos.lng, label:t.driver_name}, target);
  riderTripView = {phase, map, request_id: t.request_id};
  // Cancel button (pickup phase only — the button only exists then).
  const rc = $('#riderCancelBtn');
  if(rc) rc.addEventListener('click', async ()=>{
    if(!confirm('Cancel this ride? Your driver will be notified.')) return;
    try{ await api('cancel_request.php', {method:'POST', body:{request_id: t.request_id}}); }
    catch(e){ toast(e.message); return; }
    state.activeRequestId = null;
    stopRiderPoll();
    resetRideUI();
    toast('Ride cancelled.');
  });
  if(!silent) toast(phase==='pickup' ? 'A driver accepted your ride!' : 'Ride started — have a blessed trip!');
}
$('#cancelRequest').addEventListener('click', async ()=>{
  if(!state.activeRequestId){ resetRideUI(); return; }
  try{ await api('cancel_request.php', {method:'POST', body:{request_id: state.activeRequestId}}); }
  catch(e){ /* fall through */ }
  state.activeRequestId = null;
  stopRiderPoll();
  resetRideUI();
  toast('Request cancelled.');
});
function resetRideUI(){
  if(riderTripView && riderTripView.map) riderTripView.map.destroy();
  riderTripView = null;
  $('#rideEmpty').hidden = false;
  $('#matchingState').hidden = true;
  $('#acceptedState').hidden = true;
}

/* ---------- driver flow ---------- */
$('#goOnline').addEventListener('click', async ()=>{
  if(!requireAuth('drive')) return;
  if(!state.user.has_car){ toast('Rider-only profiles cannot receive ride requests.'); return; }
  const mosqueId = +$('#driveMosque').value;
  const m = mosqueById(mosqueId);
  let lat = 0, lng = 0;
  try{
    const pos = await getPosition();
    lat = pos.coords.latitude; lng = pos.coords.longitude;
  }catch(e){
    if(m){ lat = m.lat; lng = m.lng; } // fall back to the destination mosque
  }
  try{
    await api('driver_status.php', {method:'POST', body:{online:1, mosque_id:mosqueId, lat, lng}});
    state.driverOnline = true;
    $('#driverSetup').hidden = true;
    $('#onlinePanel').hidden = false;
    $('#statusDot').classList.add('online');
    $('#driverStatusText').textContent = 'Online for one trip';
    toast('You are online for '+(m ? m.label : 'your mosque')+'.');
    startDriverPoll();
  }catch(e){ toast(e.message); }
});

function startDriverPoll(){
  stopDriverPoll();
  state.driverPoll = setInterval(pollDriverRequests, 5000);
  pollDriverRequests();
}
function stopDriverPoll(){ clearInterval(state.driverPoll); state.driverPoll = null; }

async function pollDriverRequests(){
  try{
    const d = await api('driver_requests.php');
    renderIncoming(d.requests || []);
  }catch(e){
    if(/Go online first/.test(e.message)){ setDriverOfflineUI(); }
  }
}
function renderIncoming(reqs){
  const box = $('#incomingList');
  if(!reqs.length){
    box.innerHTML = '<div class="request-card"><p class="eyebrow">Waiting</p><h3>No requests yet</h3><p style="color:var(--muted)">Matching same-gender requests for your mosque will appear here.</p></div>';
    return;
  }
  box.innerHTML = '';
  reqs.forEach(r=>{
    const card = document.createElement('div');
    card.className = 'request-card';
    card.innerHTML = `
      <p class="eyebrow">Nearby request</p>
      <h3>${r.dist_km} km away</h3>
      <p style="color:var(--muted)">${r.note ? esc(r.note) : 'Pickup details unlock after acceptance.'}</p>
      <div class="request-meta"><span class="chip">Same-gender match</span><span class="chip">Phone verified</span></div>
      <div style="display:flex;gap:9px">
        <button class="btn primary" data-accept="${r.id}">Accept</button>
        <button class="btn danger" data-decline="${r.id}">Decline</button>
      </div>`;
    box.appendChild(card);
  });
  box.querySelectorAll('[data-accept]').forEach(b=>b.addEventListener('click', ()=>respondTo(b.dataset.accept, true)));
  box.querySelectorAll('[data-decline]').forEach(b=>b.addEventListener('click', ()=>respondTo(b.dataset.decline, false)));
}
async function respondTo(requestId, accept){
  try{
    await api('respond_request.php', {method:'POST', body:{request_id:+requestId, accept: accept?1:0}});
    if(accept){
      const d = await api('my_trip.php');
      if(d.driver_trip){
        startDriverTrip(d.driver_trip);
        toast('Request accepted. Head to the pickup.');
      }else{
        // Accept landed but no driver trip came back — never fail silently.
        toast('Accepted, but the trip view did not load. Stay on the Drive tab and tell me.');
        pollDriverRequests();
      }
    }else{
      toast('Request declined.');
      pollDriverRequests();
    }
  }catch(e){ toast(e.message); }
}

/* ---------- driver trip tracking ---------- */
function startDriverTrip(t){
  driverTrip = {request_id: t.request_id};
  stopDriverPoll(); // the queue is done — this trip is the whole screen now
  renderDriverTrip(t);
  startDriverLocPings();
}
function endDriverTrip(){
  stopDriverLocPings();
  if(driverTripView && driverTripView.map) driverTripView.map.destroy();
  driverTripView = null;
  driverTrip = null;
  $('#incomingList').innerHTML = '';
}
/* Driver's live view: pickup phase -> PIN confirm -> ride-to-mosque phase. */
async function renderDriverTrip(t){
  const phase = t.ride_started ? 'mosque' : 'pickup';
  if(driverTripView && driverTripView.map) driverTripView.map.destroy();
  const box = $('#incomingList');
  const target = phase==='pickup'
    ? {lat:t.pickup_lat, lng:t.pickup_lng, label:'Rider pickup', navUrl:t.maps_url}
    : {lat:t.mosque_lat, lng:t.mosque_lng, label:t.mosque_name, navUrl:t.mosque_maps_url};
  box.innerHTML = `
    <div class="trip-map-wrap"><div class="map-shell"><div id="driverTripMap" class="map"></div></div></div>
    <div class="request-card" style="margin-top:12px">
      <p class="eyebrow">${phase==='pickup' ? 'Heading to pickup' : 'Ride started'}</p>
      <h3>${phase==='pickup' ? esc(t.rider_name) : 'To '+esc(t.mosque_name)}</h3>
      ${t.note?`<p style="color:var(--muted)">${esc(t.note)}</p>`:''}
      ${phase==='pickup' ? `
        <div class="trip-code"><span>Ask the rider for the code</span><strong>••••</strong><small>4-digit pickup code</small></div>
        <div style="display:flex;gap:9px;margin-top:14px">
          <a class="btn secondary" style="flex:1" href="${esc(target.navUrl)}" target="_blank" rel="noopener">Navigate</a>
          <button class="btn primary" style="flex:1" id="pickedUpBtn">Picked up?</button>
        </div>
        <button class="btn btn-danger-ghost btn-block" id="driverCancelBtn" style="margin-top:10px">Cancel trip</button>` : `
        <div style="display:flex;gap:9px;margin-top:14px">
          <a class="btn secondary" style="flex:1" href="${esc(target.navUrl)}" target="_blank" rel="noopener">Navigate</a>
          <button class="btn primary" style="flex:1" id="completeTripBtn">Complete trip</button>
        </div>`}
    </div>`;
  let dPos;
  try{
    const pos = await getPosition();
    dPos = {lat:pos.coords.latitude, lng:pos.coords.longitude};
  }catch(e){
    dPos = {lat:target.lat, lng:target.lng}; // fallback: center on destination
  }
  const map = mountTripMap('driverTripMap', {lat:dPos.lat, lng:dPos.lng, label:'You'}, target);
  driverTripView = {phase, map};
  const pu = $('#pickedUpBtn');
  if(pu) pu.addEventListener('click', ()=>{ $('#pickupCode').value=''; $('#pinDialog').showModal(); setTimeout(()=>$('#pickupCode').focus(), 100); });
  const ct = $('#completeTripBtn');
  if(ct) ct.addEventListener('click', completeDriverTrip);
  const dc = $('#driverCancelBtn');
  if(dc) dc.addEventListener('click', async ()=>{
    if(!confirm('Cancel this trip? The rider will be notified and the request goes back to the queue.')) return;
    try{ await api('driver_cancel.php', {method:'POST', body:{request_id: driverTrip.request_id}}); }
    catch(e){ toast(e.message); return; }
    endDriverTrip();
    goOffline('Trip cancelled. You are now offline.');
  });
}
async function completeDriverTrip(){
  try{
    await api('complete_trip.php', {method:'POST', body:{request_id: driverTrip.request_id}});
  }catch(e){ toast(e.message); return; }
  endDriverTrip();
  goOffline('Trip completed. JazakAllah khair!');
}
/* Driver position ping — feeds the rider's live map. */
function startDriverLocPings(){
  stopDriverLocPings();
  const ping = async ()=>{
    try{
      const pos = await getPosition();
      await api('update_location.php', {method:'POST', body:{lat:pos.coords.latitude, lng:pos.coords.longitude}});
      if(driverTripView && driverTripView.map) driverTripView.map.moveDriver(pos.coords.latitude, pos.coords.longitude);
    }catch(e){ /* GPS hiccup — next ping in 10s */ }
  };
  ping();
  driverLocTimer = setInterval(ping, 10000);
}
function stopDriverLocPings(){ clearInterval(driverLocTimer); driverLocTimer = null; }
async function goOffline(msg){
  try{ await api('driver_status.php', {method:'POST', body:{online:0}}); }catch(e){}
  setDriverOfflineUI();
  if(msg) toast(msg);
}
function setDriverOfflineUI(){
  state.driverOnline = false;
  stopDriverPoll();
  endDriverTrip();
  $('#driverSetup').hidden = false;
  $('#onlinePanel').hidden = true;
  $('#statusDot').classList.remove('online');
  $('#driverStatusText').textContent = 'You are offline';
}
/* Restore the online panel after a page reload. */
function restoreDriverOnline(withQueue=true){
  state.driverOnline = true;
  $('#driverSetup').hidden = true;
  $('#onlinePanel').hidden = false;
  $('#statusDot').classList.add('online');
  $('#driverStatusText').textContent = 'Online — waiting for requests';
  if(withQueue){ pollDriverRequests(); startDriverPoll(); }
}
$('#goOffline').addEventListener('click', ()=>goOffline('You are offline.'));

/* Pickup PIN dialog wiring. */
$('#pinClose').addEventListener('click', ()=>$('#pinDialog').close());
$('#confirmPickup').addEventListener('click', async ()=>{
  const code = $('#pickupCode').value.trim();
  if(!/^\d{4}$/.test(code)){ toast('Enter the 4-digit code.'); return; }
  if(!driverTrip){ $('#pinDialog').close(); return; }
  try{
    await api('verify_pickup.php', {method:'POST', body:{request_id: driverTrip.request_id, code}});
    $('#pinDialog').close();
    const d = await api('my_trip.php');
    if(d.driver_trip) renderDriverTrip(d.driver_trip);
    toast('Ride started!');
  }catch(e){ toast(e.message); }
});

function syncDriverUI(user){
  // If the driver was left online in a previous session, reflect it.
  if(user && user.has_car && user.driver && +user.driver.is_online === 1){
    state.driverOnline = true;
    $('#driverSetup').hidden = true;
    $('#onlinePanel').hidden = false;
    $('#statusDot').classList.add('online');
    $('#driverStatusText').textContent = 'Online for one trip';
    startDriverPoll();
  }
}
function stopAllPolling(){ stopRiderPoll(); stopDriverPoll(); }

/* ---------- auth dialog wiring ---------- */
choiceGroup('#authTabs', setAuthTab);
choiceGroup('#genderChoice');
choiceGroup('#carChoice', v=>{ $('#vehicleFields').hidden = v!=='yes'; });
choiceGroup('#rideWindow');
choiceGroup('#driveWindow');
$('#doLogin').addEventListener('click', doLogin);
$('#doSignup').addEventListener('click', doSignup);
$('#doLogout').addEventListener('click', doLogout);
$('#loginPassword').addEventListener('keydown', e=>{ if(e.key==='Enter') doLogin(); });
$('#suPassword').addEventListener('keydown', e=>{ if(e.key==='Enter') doSignup(); });

/* ---------- boot ---------- */
(async function boot(){
  await loadMosques();
  if(state.token){
    try{
      const d = await api('me.php');
      setSession(state.token, d.user);
      syncDriverUI(d.user);
      // Resume any live trips — rider and driver roles are independent.
      const t = await api('my_trip.php').catch(()=>null);
      if(t){
        if(t.rider_trip){
          state.activeRequestId = t.rider_trip.request_id;
          $('#rideEmpty').hidden = true;
          if(t.rider_trip.status==='accepted' || t.rider_trip.status==='picked_up'){ renderRiderTrip(t.rider_trip, true); startRiderPoll(); }
          else { $('#matchingState').hidden = false; startRiderPoll(); }
        }
        if(t.driver_trip){
          restoreDriverOnline(false);
          $('#driverStatusText').textContent = 'Online — on a trip';
          startDriverTrip(t.driver_trip);
        }else if(state.user && state.user.has_car){
          const ds = await api('driver_status.php').catch(()=>null);
          if(ds && ds.online) restoreDriverOnline();
        }
      }
    }catch(e){
      setSession(null, null); // bad/expired token
    }
  }
})();
