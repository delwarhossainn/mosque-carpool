<?php
// Rider requests a ride: picks a mosque, shares pickup point.
// Riders never see drivers until one accepts.
require_once __DIR__ . '/_bootstrap.php';
$u = require_auth();
$b = body();
$pdo = db();

$active = $pdo->prepare(
  "SELECT id FROM ride_requests WHERE rider_id = ? AND status IN ('pending','accepted') LIMIT 1"
);
$active->execute([$u['id']]);
if ($active->fetch()) fail('You already have an active ride request.', 409);

$mosqueId = (int)($b['mosque_id'] ?? 0);
$lat = (float)($b['lat'] ?? 0); $lng = (float)($b['lng'] ?? 0);
$note = trim($b['note'] ?? '');
if ($mosqueId <= 0) fail('Choose the mosque you want to go to.');
$chk = $pdo->prepare('SELECT id, name FROM mosques WHERE id = ?');
$chk->execute([$mosqueId]);
$mosque = $chk->fetch();
if (!$mosque) fail('Unknown mosque.');

$st = $pdo->prepare(
  'INSERT INTO ride_requests (rider_id, mosque_id, pickup_lat, pickup_lng, note)
   VALUES (?,?,?,?,?)'
);
$st->execute([$u['id'], $mosqueId, $lat, $lng, $note ?: null]);
$id = (int)$pdo->lastInsertId();

// How many eligible drivers are online right now? (same mosque + same gender)
$cnt = $pdo->prepare(
  "SELECT COUNT(*) FROM driver_status d JOIN users x ON x.id = d.user_id
   WHERE d.is_online = 1 AND d.mosque_id = ? AND x.gender = ? AND x.id <> ?"
);
$cnt->execute([$mosqueId, $u['gender'], $u['id']]);

respond(['ok' => true, 'request_id' => $id,
  'mosque' => $mosque['name'], 'drivers_online' => (int)$cnt->fetchColumn()]);
