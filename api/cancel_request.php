<?php
require_once __DIR__ . '/_bootstrap.php';
$u = require_auth();
$b = body();
$id = (int)($b['request_id'] ?? 0);
$pdo = db();

// Rider can cancel a pending request or an accepted trip (before pickup).
$st = $pdo->prepare(
  "SELECT id, driver_id, status FROM ride_requests
   WHERE id = ? AND rider_id = ? AND status IN ('pending','accepted') LIMIT 1"
);
$st->execute([$id, $u['id']]);
$req = $st->fetch();
if (!$req) fail('Request not found or can no longer be cancelled.', 404);

$pdo->prepare("UPDATE ride_requests SET status = 'cancelled' WHERE id = ?")->execute([$id]);

// Notify the driver if one had accepted.
if (!empty($req['driver_id'])) {
  notify((int)$req['driver_id'], 'rider_cancelled',
    'Rider cancelled',
    'The rider cancelled the trip before pickup.');
}

respond(['ok' => true]);
