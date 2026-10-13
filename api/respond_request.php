<?php
// Driver accepts or declines a request. Accept is atomic:
// only one driver can claim a request (rowCount check).
// POST { request_id, accept: 1|0 }
require_once __DIR__ . '/_bootstrap.php';
$u = require_auth();
$b = body();
$pdo = db();
$id = (int)($b['request_id'] ?? 0);
$accept = !empty($b['accept']);

$st = $pdo->prepare('SELECT is_online, mosque_id FROM driver_status WHERE user_id = ?');
$st->execute([$u['id']]);
$d = $st->fetch();
if (!$d || !$d['is_online']) fail('Go online first.', 403);

$r = $pdo->prepare(
  'SELECT r.*, x.gender AS rider_gender, x.name AS rider_name
   FROM ride_requests r JOIN users x ON x.id = r.rider_id WHERE r.id = ?'
);
$r->execute([$id]);
$req = $r->fetch();
if (!$req) fail('Request not found.', 404);

// Safety rules, enforced server-side no matter what the app sends.
if ($req['rider_gender'] !== $u['gender']) fail('Gender pairing rule violated.', 403);
if ((int)$req['mosque_id'] !== (int)$d['mosque_id']) fail('This request is for a different mosque.', 403);

if ($accept) {
    $code = str_pad((string)random_int(0, 9999), 4, '0', STR_PAD_LEFT);
    $up = $pdo->prepare(
      "UPDATE ride_requests SET status = 'accepted', driver_id = ?, pickup_code = ?
       WHERE id = ? AND status = 'pending' AND driver_id IS NULL"
    );
    $up->execute([$u['id'], $code, $id]);
    if ($up->rowCount() === 0) fail('Another driver already accepted this ride.', 409);
    notify((int)$req['rider_id'], 'ride_accepted',
      'A driver accepted your ride',
      $u['name'] . ' is on the way. Your pickup code is ' . $code . '.');
    respond(['ok' => true, 'accepted' => true, 'pickup_code' => $code]);
} else {
    $pdo->prepare('INSERT IGNORE INTO ride_declines (request_id, driver_id) VALUES (?,?)')
        ->execute([$id, $u['id']]);
    respond(['ok' => true, 'accepted' => false]);
}
