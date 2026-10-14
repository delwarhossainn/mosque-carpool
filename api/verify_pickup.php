<?php
// Driver confirms the pickup by entering the rider's 4-digit code.
// POST { request_id, code }  ->  status 'accepted' => 'picked_up' (ride starts)
require_once __DIR__ . '/_bootstrap.php';
$u = require_auth();
$b = body();
$pdo = db();
$id = (int)($b['request_id'] ?? 0);
$code = trim($b['code'] ?? '');

if (!preg_match('/^\d{4}$/', $code)) fail('Enter the 4-digit pickup code.');

$r = $pdo->prepare(
  "SELECT r.* FROM ride_requests r WHERE r.id = ? AND r.driver_id = ? AND r.status = 'accepted'"
);
$r->execute([$id, $u['id']]);
$req = $r->fetch();
if (!$req) fail('Trip not found or not ready for pickup.', 404);
if ($req['pickup_code'] !== $code) fail('That code does not match. Ask the rider to read it again.', 403);

$pdo->prepare("UPDATE ride_requests SET status = 'picked_up' WHERE id = ?")->execute([$id]);
notify((int)$req['rider_id'], 'ride_started',
  'Your ride has started',
  $u['name'] . ' confirmed your pickup code. Have a blessed trip to the mosque.');
respond(['ok' => true]);
