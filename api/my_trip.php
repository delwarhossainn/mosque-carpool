<?php
// One poll endpoint for both sides.
// Rider: sees NOTHING about drivers while pending; full details once accepted.
// Driver: sees their accepted/picked-up trip with rider pickup details.
// Statuses: pending -> accepted (driver heading to pickup) ->
//           picked_up (ride to mosque started) -> completed/cancelled
require_once __DIR__ . '/_bootstrap.php';
$u = require_auth();
$pdo = db();
$live = "('pending','accepted','picked_up')";

// As rider
$st = $pdo->prepare(
  "SELECT r.*, m.name AS mosque_name, m.lat AS mosque_lat, m.lng AS mosque_lng
   FROM ride_requests r JOIN mosques m ON m.id = r.mosque_id
   WHERE r.rider_id = ? AND r.status IN $live
   ORDER BY r.id DESC LIMIT 1"
);
$st->execute([$u['id']]);
$trip = $st->fetch();
if ($trip) {
    $out = [
      'role' => 'rider', 'request_id' => (int)$trip['id'],
      'status' => $trip['status'], 'mosque_name' => $trip['mosque_name'],
      'mosque_lat' => (float)$trip['mosque_lat'], 'mosque_lng' => (float)$trip['mosque_lng'],
      'pickup_lat' => (float)$trip['pickup_lat'], 'pickup_lng' => (float)$trip['pickup_lng'],
      'ride_started' => $trip['status'] === 'picked_up',
    ];
    if ($trip['status'] === 'accepted' || $trip['status'] === 'picked_up') {
        $dv = $pdo->prepare(
          'SELECT u.name, u.car_details, d.lat, d.lng
           FROM users u LEFT JOIN driver_status d ON d.user_id = u.id WHERE u.id = ?'
        );
        $dv->execute([$trip['driver_id']]);
        $dr = $dv->fetch();
        $dist = km((float)$trip['pickup_lat'], (float)$trip['pickup_lng'],
                   (float)$dr['lat'], (float)$dr['lng']);
        $out['driver_name']  = $dr['name'];
        $out['car_details']  = $dr['car_details'];
        $out['pickup_code']  = $trip['pickup_code'];
        $out['driver_lat']   = $dr['lat'] === null ? null : (float)$dr['lat'];
        $out['driver_lng']   = $dr['lng'] === null ? null : (float)$dr['lng'];
        $out['eta_min']      = max(2, (int)round($dist / 30 * 60));
        $out['maps_url']     = 'https://www.google.com/maps/dir/?api=1&destination='
                             . $trip['mosque_lat'] . ',' . $trip['mosque_lng'];
    }
    respond(['ok' => true, 'trip' => $out]);
}

// As driver
$st = $pdo->prepare(
  "SELECT r.*, m.name AS mosque_name, m.lat AS mosque_lat, m.lng AS mosque_lng,
          x.name AS rider_name
   FROM ride_requests r
   JOIN mosques m ON m.id = r.mosque_id
   JOIN users x ON x.id = r.rider_id
   WHERE r.driver_id = ? AND r.status IN ('accepted','picked_up')
   ORDER BY r.id DESC LIMIT 1"
);
$st->execute([$u['id']]);
$trip = $st->fetch();
if ($trip) {
    respond(['ok' => true, 'trip' => [
      'role' => 'driver', 'request_id' => (int)$trip['id'], 'status' => $trip['status'],
      'mosque_name' => $trip['mosque_name'],
      'mosque_lat' => (float)$trip['mosque_lat'], 'mosque_lng' => (float)$trip['mosque_lng'],
      'rider_name' => $trip['rider_name'],
      'pickup_lat' => (float)$trip['pickup_lat'], 'pickup_lng' => (float)$trip['pickup_lng'],
      'pickup_code' => $trip['pickup_code'], 'note' => $trip['note'],
      'ride_started' => $trip['status'] === 'picked_up',
      'maps_url' => 'https://www.google.com/maps/dir/?api=1&destination='
                  . $trip['pickup_lat'] . ',' . $trip['pickup_lng'],
      'mosque_maps_url' => 'https://www.google.com/maps/dir/?api=1&destination='
                  . $trip['mosque_lat'] . ',' . $trip['mosque_lng'],
    ]]);
}

respond(['ok' => true, 'trip' => null]);
