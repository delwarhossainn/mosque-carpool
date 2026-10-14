-- ============================================================
-- Mosque Carpool — cPanel/MySQL schema
-- Import via cPanel > phpMyAdmin > Import
-- ============================================================

CREATE TABLE IF NOT EXISTS mosques (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  address VARCHAR(160) NOT NULL,
  city VARCHAR(80) NOT NULL DEFAULT 'Winnipeg',
  province VARCHAR(10) NOT NULL DEFAULT 'MB',
  postal_code VARCHAR(12) NULL,
  lat DECIMAL(10,7) NOT NULL,
  lng DECIMAL(10,7) NOT NULL,
  UNIQUE KEY uq_mosque_name_address (name, address)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(160) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  gender ENUM('male','female') NOT NULL,
  has_car TINYINT(1) NOT NULL DEFAULT 0,
  car_details VARCHAR(160) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sessions (
  token CHAR(64) PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS driver_status (
  user_id INT UNSIGNED PRIMARY KEY,
  is_online TINYINT(1) NOT NULL DEFAULT 0,
  mosque_id INT UNSIGNED NULL,
  lat DECIMAL(10,7) NULL,
  lng DECIMAL(10,7) NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (mosque_id) REFERENCES mosques(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ride_requests (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  rider_id INT UNSIGNED NOT NULL,
  mosque_id INT UNSIGNED NOT NULL,
  pickup_lat DECIMAL(10,7) NOT NULL,
  pickup_lng DECIMAL(10,7) NOT NULL,
  note VARCHAR(255) NULL,
  status ENUM('pending','accepted','picked_up','completed','cancelled') NOT NULL DEFAULT 'pending',
  driver_id INT UNSIGNED NULL,
  pickup_code CHAR(4) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (rider_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (driver_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (mosque_id) REFERENCES mosques(id),
  INDEX idx_status_mosque (status, mosque_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Tracks which drivers declined which requests, so a declined
-- request goes back to the pool but not to the same driver.
CREATE TABLE IF NOT EXISTS ride_declines (
  request_id INT UNSIGNED NOT NULL,
  driver_id INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (request_id, driver_id),
  FOREIGN KEY (request_id) REFERENCES ride_requests(id) ON DELETE CASCADE,
  FOREIGN KEY (driver_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notifications (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  type VARCHAR(40) NOT NULL,
  title VARCHAR(160) NOT NULL,
  body VARCHAR(255) NOT NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_read (user_id, is_read)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- Verified Winnipeg mosque directory (14 destinations)
-- ============================================================
INSERT IGNORE INTO mosques (name, address, city, province, postal_code, lat, lng) VALUES
('Manitoba Islamic Association — Grand Mosque', '2445 Waverley St', 'Winnipeg', 'MB', 'R3Y 1S3', 49.7914428, -97.1749375),
('Winnipeg Central Mosque', '715 Ellice Ave', 'Winnipeg', 'MB', 'R3G 0B3', 49.8932488, -97.1644922),
('Salam Masjid', '294 Burrows Ave', 'Winnipeg', 'MB', NULL, 49.9156197, -97.1348114),
('Masjid Bilal — Winnipeg Islamic Centre', '33 Warnock St', 'Winnipeg', 'MB', NULL, 49.9137890, -97.1677903),
('ICNA Centre & Mosque', '426 St Anne''s Rd', 'Winnipeg', 'MB', NULL, 49.8459557, -97.0976442),
('Pakistan Centre Masjid', '348 Ross Ave', 'Winnipeg', 'MB', NULL, 49.9018270, -97.1424600),
('MIA Connections', '406 Edmonton St', 'Winnipeg', 'MB', NULL, 49.8960213, -97.1495499),
('University of Winnipeg Prayer Space', 'Graham Hall, 515 Portage Ave', 'Winnipeg', 'MB', NULL, 49.8905686, -97.1532053),
('Pioneer Mosque', '247 Hazelwood Ave', 'Winnipeg', 'MB', 'R2M 4W1', 49.8266900, -97.1013800),
('Madinah Masjid', '431C Thames Ave', 'Winnipeg', 'MB', 'R2L 0V4', 49.9090100, -97.1019800),
('Faizan-e-Madina Winnipeg', '585 St Anne''s Rd', 'Winnipeg', 'MB', 'R2M 5R5', 49.8337000, -97.0897000),
('Islamic Educational Foundation', '731 Wellington Ave', 'Winnipeg', 'MB', 'R3E 0H9', 49.9003400, -97.1649600),
('Jamia Masjid Abobakar Siddique & Community Centre', '794 Ellice Ave', 'Winnipeg', 'MB', 'R3G 0B9', 49.8930000, -97.1678900),
('Yaseen Centre of Manitoba', '746 Ellice Ave', 'Winnipeg', 'MB', 'R3G 0B6', 49.8930030, -97.1655930);
