<?php
// ============================================================
// Mosque Carpool — one-time database setup.
// 1. Deploy this app on Railway (or cPanel).
// 2. Visit https://YOUR-DOMAIN/install.php ONCE.
// 3. See "OK" below, then DELETE this file.
// ============================================================
header('Content-Type: text/plain; charset=utf-8');
require_once __DIR__ . '/config.php';

try {
    $pdo = new PDO(
        'mysql:host=' . DB_HOST . ';port=' . DB_PORT . ';dbname=' . DB_NAME . ';charset=utf8mb4',
        DB_USER, DB_PASS,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );

    $sql = file_get_contents(__DIR__ . '/schema.sql');
    // Strip full-line comments, then split into statements.
    $lines = array_filter(explode("\n", $sql), fn($l) => !preg_match('/^\s*--/', $l));
    $statements = array_filter(array_map('trim', explode(";\n", implode("\n", $lines))));

    $count = 0;
    foreach ($statements as $stmt) {
        if ($stmt === '') continue;
        $pdo->exec($stmt);
        $count++;
    }

    $tables  = $pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
    $mosques = $pdo->query('SELECT COUNT(*) FROM mosques')->fetchColumn();

    echo "OK — database is ready.\n";
    echo "Statements executed: $count\n";
    echo "Tables: " . implode(', ', $tables) . "\n";
    echo "Mosques seeded: $mosques\n\n";
    echo "Now DELETE install.php (it has done its job).";
} catch (Throwable $e) {
    http_response_code(500);
    echo "FAILED: " . $e->getMessage() . "\n";
    echo "Check that the MYSQL* variables are set on the Railway service.";
}
