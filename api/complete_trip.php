<?php
// Driver marks the ride completed after drop-off.
require_once __DIR__ . '/_bootstrap.php';
$u = require_auth();
$b = body();
$id = (int)($b['request_id'] ?? 0);

$st = db()->prepare(
  "UPDATE ride_requests SET status = 'completed'
   WHERE id = ? AND driver_id = ? AND status IN ('accepted','picked_up')"
);
$st->execute([$id, $u['id']]);
if ($st->rowCount() === 0) fail('Trip not found.', 404);

$r = db()->prepare('SELECT rider_id FROM ride_requests WHERE id = ?');
$r->execute([$id]);
$rider = (int)$r->fetchColumn();
notify($rider, 'trip_completed', 'Trip completed',
  'JazakAllah khair! You made it to the mosque. Consider going online as a driver next time.');
respond(['ok' => true]);
