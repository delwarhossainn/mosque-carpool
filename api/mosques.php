<?php
require_once __DIR__ . '/_bootstrap.php';
$rows = db()->query('SELECT id, name, address, city, province, postal_code, lat, lng FROM mosques ORDER BY name')->fetchAll();
respond(['ok' => true, 'mosques' => $rows]);
