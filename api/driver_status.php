<?php
// Driver taps "Go Online": picks a mosque, shares live position.
// POST { online: 1, mosque_id, lat, lng }  |  POST { online: 0 }
require_once __DIR__ . '/_bootstrap.php';
$u = require_auth();
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
    $pdo->prepare('UPDATE driver_status SET is_online = 0 WHERE user_id = ?')->execute([$u['id']]);
}
respond(['ok' => true, 'online' => $online]);
