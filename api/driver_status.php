<?php
// Driver taps "Go Online": picks a mosque, shares live position.
// GET -> current online state  |  POST { online: 1, mosque_id, lat, lng }  |  POST { online: 0 }
require_once __DIR__ . '/_bootstrap.php';
$u = require_auth();
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $st = db()->prepare('SELECT is_online, mosque_id FROM driver_status WHERE user_id = ?');
    $st->execute([$u['id']]);
    $row = $st->fetch();
    respond(['ok' => true, 'online' => (bool)($row['is_online'] ?? 0), 'mosque_id' => $row ? (int)$row['mosque_id'] : null]);
}
$b = body();
if (!$u['has_car']) fail('Only users with a car can go online as a driver.', 403);

$online = !empty($b['online']) ? 1 : 0;
$pdo = db();
if ($online) {
    $mosqueId = (int)($b['mosque_id'] ?? 0);
    $lat = (float)($b['lat'] ?? 0); $lng = (float)($b['lng'] ?? 0);
    if ($mosqueId <= 0) fail('Choose the mosque you are driving to.');
    $chk = $pdo->prepare('SELECT id FROM mosques WHERE id = ?');
    $chk->execute([$mosqueId]);
    if (!$chk->fetch()) fail('Unknown mosque.');
    $pdo->prepare('UPDATE driver_status SET is_online = 1, mosque_id = ?, lat = ?, lng = ? WHERE user_id = ?')
        ->execute([$mosqueId, $lat, $lng, $u['id']]);
} else {
    // Going offline with a not-yet-started pickup: release it back to the
    // queue so another driver can take it, and tell the rider.
    $rel = $pdo->prepare("SELECT id, rider_id FROM ride_requests WHERE driver_id = ? AND status = 'accepted'");
    $rel->execute([$u['id']]);
    foreach ($rel->fetchAll() as $r) {
        notify((int)$r['rider_id'], 'driver_offline',
          'Looking for another driver',
          'Your driver went offline. Your request is back in the queue.');
    }
    $pdo->prepare("UPDATE ride_requests SET status = 'pending', driver_id = NULL, pickup_code = NULL
                   WHERE driver_id = ? AND status = 'accepted'")->execute([$u['id']]);
    $pdo->prepare('UPDATE driver_status SET is_online = 0 WHERE user_id = ?')->execute([$u['id']]);
}
respond(['ok' => true, 'online' => $online]);
