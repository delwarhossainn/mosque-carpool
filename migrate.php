<?php
// ONE-TIME migration: dedupe mosques + add the 'picked_up' ride status.
// Visit this URL once in the browser, then DELETE this file.
header('Content-Type: text/plain; charset=utf-8');
require_once __DIR__ . '/config.php';
$pdo = new PDO(
    'mysql:host=' . DB_HOST . ';port=' . DB_PORT . ';dbname=' . DB_NAME . ';charset=utf8mb4',
    DB_USER, DB_PASS,
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
);
$log = [];
try {
    // 1. Re-point any live references from duplicate mosque rows to the original.
    $pdo->exec("UPDATE driver_status ds JOIN mosques dup ON dup.id = ds.mosque_id JOIN mosques keep ON keep.name = dup.name AND keep.address = dup.address AND keep.id < dup.id SET ds.mosque_id = keep.id");
    $log[] = 'driver_status re-pointed';
    $pdo->exec("UPDATE ride_requests rr JOIN mosques dup ON dup.id = rr.mosque_id JOIN mosques keep ON keep.name = dup.name AND keep.address = dup.address AND keep.id < dup.id SET rr.mosque_id = keep.id");
    $log[] = 'ride_requests re-pointed';
    // 2. Delete duplicates, keeping the lowest id per mosque.
    $deleted = $pdo->exec("DELETE m1 FROM mosques m1 JOIN mosques m2 ON m1.name = m2.name AND m1.address = m2.address AND m1.id > m2.id");
    $log[] = "duplicate mosques deleted: $deleted";
    // 3. Add the 'picked_up' status for the trip-tracking flow.
    $pdo->exec("ALTER TABLE ride_requests MODIFY status ENUM('pending','accepted','picked_up','completed','cancelled') NOT NULL DEFAULT 'pending'");
    $log[] = 'status enum updated';
    // 4. Verify.
    $row = $pdo->query("SELECT COUNT(*) AS total, COUNT(DISTINCT name) AS unique_names FROM mosques")->fetch();
    $log[] = "mosques: {$row['total']} rows, {$row['unique_names']} unique names";
    $col = $pdo->query("SHOW COLUMNS FROM ride_requests LIKE 'status'")->fetch();
    $log[] = 'status column: ' . $col['Type'];
    echo "MIGRATION OK\n" . implode("\n", $log) . "\n";
} catch (Throwable $e) {
    http_response_code(500);
    echo "MIGRATION FAILED: " . $e->getMessage() . "\n" . implode("\n", $log) . "\n";
}
