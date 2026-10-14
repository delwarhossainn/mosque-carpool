<?php
// One-time testing helper: ends ALL live rides for the signed-in user,
// whether they are the rider or the driver. POST, requires auth.
require_once __DIR__ . '/_bootstrap.php';
$u = require_auth();
$pdo = db();
$live = "('pending','accepted','picked_up')";

// As rider: cancel everything live. Tell the driver if one had accepted.
$st = $pdo->prepare(
  "SELECT id, driver_id, status FROM ride_requests WHERE rider_id = ? AND status IN $live"
);
$st->execute([$u['id']]);
$riderRows = $st->fetchAll();
foreach ($riderRows as $row) {
    if ($row['driver_id'] && $row['status'] !== 'pending') {
        notify((int)$row['driver_id'], 'ride_cancelled',
          'Ride cancelled', 'The rider cancelled the ride.');
    }
}
if ($riderRows) {
    $ids = array_column($riderRows, 'id');
    $in = implode(',', array_fill(0, count($ids), '?'));
    $pdo->prepare("UPDATE ride_requests SET status = 'cancelled' WHERE id IN ($in)")->execute($ids);
}

// As driver: complete everything live. Tell the riders.
$st = $pdo->prepare(
  "SELECT id, rider_id FROM ride_requests WHERE driver_id = ? AND status IN ('accepted','picked_up')"
);
$st->execute([$u['id']]);
$driverRows = $st->fetchAll();
foreach ($driverRows as $row) {
    notify((int)$row['rider_id'], 'ride_cancelled',
      'Ride ended', 'Your driver ended the ride.');
}
if ($driverRows) {
    $ids = array_column($driverRows, 'id');
    $in = implode(',', array_fill(0, count($ids), '?'));
    $pdo->prepare("UPDATE ride_requests SET status = 'completed' WHERE id IN ($in)")->execute($ids);
}

// Take the driver offline too, so the queue stops.
$pdo->prepare('UPDATE driver_status SET is_online = 0 WHERE user_id = ?')->execute([$u['id']]);

respond(['ok' => true,
  'rider_rides_cancelled' => count($riderRows),
  'driver_trips_completed' => count($driverRows)]);
