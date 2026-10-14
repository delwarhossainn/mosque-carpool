<?php
// One-time testing helper page. Visit while signed in to the app on this
// browser — it ends all of that account's live rides using its own session.
// DELETE this file after use.
?><!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>End all my rides</title></head>
<body style="font-family:sans-serif;padding:40px;max-width:560px">
<h1>End all my rides</h1>
<p id="status">Working…</p>
<script>
(async () => {
  const el = document.getElementById('status');
  const token = localStorage.getItem('mc_token');
  if (!token) {
    el.textContent = 'Not signed in on this browser. Sign in to the app first, then reload this page.';
    return;
  }
  try {
    const r = await fetch('api/end_all_rides.php', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'request failed');
    el.textContent = 'Done — rider rides cancelled: ' + j.rider_rides_cancelled +
      ', driver trips completed: ' + j.driver_trips_completed +
      '. This account is now offline with nothing live.';
  } catch (e) {
    el.textContent = 'Error: ' + e.message;
  }
})();
</script>
</body>
</html>
