-- Sample tables with fake data for testing the Compare feature
-- Run in Supabase SQL Editor (or your Postgres). Uses dev schema.

-- Table 1: sample_users_left
CREATE TABLE IF NOT EXISTS dev.sample_users_left (
  id BIGINT PRIMARY KEY,
  pt TEXT NOT NULL,
  email TEXT,
  name TEXT,
  status TEXT,
  created_at TIMESTAMP
);

-- Table 2: sample_users_right (same structure for comparison)
CREATE TABLE IF NOT EXISTS dev.sample_users_right (
  id BIGINT PRIMARY KEY,
  pt TEXT NOT NULL,
  email TEXT,
  name TEXT,
  status TEXT,
  created_at TIMESTAMP
);

-- Clear existing data (if tables exist)
DELETE FROM dev.sample_users_left;
DELETE FROM dev.sample_users_right;

-- Insert 50 rows into left table (PT 20260101)
INSERT INTO dev.sample_users_left (id, pt, email, name, status, created_at) VALUES
(1, '20260101', 'alice@example.com', 'Alice Wang', 'active', '2026-01-01 09:00:00'),
(2, '20260101', 'bob@example.com', 'Bob Chen', 'active', '2026-01-01 09:05:00'),
(3, '20260101', 'carol@example.com', 'Carol Liu', 'inactive', '2026-01-01 09:10:00'),
(4, '20260101', 'dave@example.com', 'Dave Zhang', 'active', '2026-01-01 09:15:00'),
(5, '20260101', 'eve@example.com', 'Eve Huang', 'pending', '2026-01-01 09:20:00'),
(6, '20260101', 'frank@example.com', 'Frank Wu', 'active', '2026-01-01 09:25:00'),
(7, '20260101', 'grace@example.com', 'Grace Lin', 'active', '2026-01-01 09:30:00'),
(8, '20260101', 'henry@example.com', 'Henry Zhou', 'inactive', '2026-01-01 09:35:00'),
(9, '20260101', 'iris@example.com', 'Iris Sun', 'active', '2026-01-01 09:40:00'),
(10, '20260101', 'jack@example.com', 'Jack Ma', 'active', '2026-01-01 09:45:00'),
(11, '20260101', 'kate@example.com', 'Kate Li', 'pending', '2026-01-01 09:50:00'),
(12, '20260101', 'leo@example.com', 'Leo Zhao', 'active', '2026-01-01 09:55:00'),
(13, '20260101', 'mia@example.com', 'Mia Chen', 'active', '2026-01-01 10:00:00'),
(14, '20260101', 'noah@example.com', 'Noah Wang', 'inactive', '2026-01-01 10:05:00'),
(15, '20260101', 'olivia@example.com', 'Olivia Zhang', 'active', '2026-01-01 10:10:00'),
(16, '20260101', 'paul@example.com', 'Paul Liu', 'active', '2026-01-01 10:15:00'),
(17, '20260101', 'quinn@example.com', 'Quinn Huang', 'pending', '2026-01-01 10:20:00'),
(18, '20260101', 'rachel@example.com', 'Rachel Wu', 'active', '2026-01-01 10:25:00'),
(19, '20260101', 'sam@example.com', 'Sam Lin', 'active', '2026-01-01 10:30:00'),
(20, '20260101', 'tina@example.com', 'Tina Zhou', 'inactive', '2026-01-01 10:35:00'),
(21, '20260101', 'uma@example.com', 'Uma Sun', 'active', '2026-01-01 10:40:00'),
(22, '20260101', 'victor@example.com', 'Victor Ma', 'active', '2026-01-01 10:45:00'),
(23, '20260101', 'wendy@example.com', 'Wendy Li', 'pending', '2026-01-01 10:50:00'),
(24, '20260101', 'xavier@example.com', 'Xavier Zhao', 'active', '2026-01-01 10:55:00'),
(25, '20260101', 'yuki@example.com', 'Yuki Chen', 'active', '2026-01-01 11:00:00'),
(26, '20260101', 'zack@example.com', 'Zack Wang', 'inactive', '2026-01-01 11:05:00'),
(27, '20260101', 'amy@example.com', 'Amy Zhang', 'active', '2026-01-01 11:10:00'),
(28, '20260101', 'ben@example.com', 'Ben Liu', 'active', '2026-01-01 11:15:00'),
(29, '20260101', 'chloe@example.com', 'Chloe Huang', 'pending', '2026-01-01 11:20:00'),
(30, '20260101', 'dan@example.com', 'Dan Wu', 'active', '2026-01-01 11:25:00'),
(31, '20260101', 'emma@example.com', 'Emma Lin', 'active', '2026-01-01 11:30:00'),
(32, '20260101', 'finn@example.com', 'Finn Zhou', 'inactive', '2026-01-01 11:35:00'),
(33, '20260101', 'gina@example.com', 'Gina Sun', 'active', '2026-01-01 11:40:00'),
(34, '20260101', 'hugo@example.com', 'Hugo Ma', 'active', '2026-01-01 11:45:00'),
(35, '20260101', 'ivy@example.com', 'Ivy Li', 'pending', '2026-01-01 11:50:00'),
(36, '20260101', 'jake@example.com', 'Jake Zhao', 'active', '2026-01-01 11:55:00'),
(37, '20260101', 'lily@example.com', 'Lily Chen', 'active', '2026-01-01 12:00:00'),
(38, '20260101', 'max@example.com', 'Max Wang', 'inactive', '2026-01-01 12:05:00'),
(39, '20260101', 'nina@example.com', 'Nina Zhang', 'active', '2026-01-01 12:10:00'),
(40, '20260101', 'owen@example.com', 'Owen Liu', 'active', '2026-01-01 12:15:00'),
(41, '20260101', 'pam@example.com', 'Pam Huang', 'pending', '2026-01-01 12:20:00'),
(42, '20260101', 'ryan@example.com', 'Ryan Wu', 'active', '2026-01-01 12:25:00'),
(43, '20260101', 'sara@example.com', 'Sara Lin', 'active', '2026-01-01 12:30:00'),
(44, '20260101', 'tom@example.com', 'Tom Zhou', 'inactive', '2026-01-01 12:35:00'),
(45, '20260101', 'una@example.com', 'Una Sun', 'active', '2026-01-01 12:40:00'),
(46, '20260101', 'vince@example.com', 'Vince Ma', 'active', '2026-01-01 12:45:00'),
(47, '20260101', 'willa@example.com', 'Willa Li', 'pending', '2026-01-01 12:50:00'),
(48, '20260101', 'xander@example.com', 'Xander Zhao', 'active', '2026-01-01 12:55:00'),
(49, '20260101', 'yara@example.com', 'Yara Chen', 'active', '2026-01-01 13:00:00'),
(50, '20260101', 'zoe@example.com', 'Zoe Wang', 'inactive', '2026-01-01 13:05:00');

-- Insert 50 rows into right table (PT 20260101) - with some differences for comparison:
-- IDs 1-45 exist in both (some with different names/status)
-- IDs 51-55 exist only in right
-- IDs 46-50 exist only in left (so right is missing them)
INSERT INTO dev.sample_users_right (id, pt, email, name, status, created_at) VALUES
(1, '20260101', 'alice@example.com', 'Alice Wang', 'active', '2026-01-01 09:00:00'),
(2, '20260101', 'bob@example.com', 'Bob Chen', 'suspended', '2026-01-01 09:05:00'),  -- different status
(3, '20260101', 'carol@example.com', 'Carol Liu', 'inactive', '2026-01-01 09:10:00'),
(4, '20260101', 'dave@example.com', 'Dave Zhang', 'active', '2026-01-01 09:15:00'),
(5, '20260101', 'eve@example.com', 'Eve Huang', 'active', '2026-01-01 09:20:00'),   -- different status
(6, '20260101', 'frank@example.com', 'Frank Wu', 'active', '2026-01-01 09:25:00'),
(7, '20260101', 'grace@example.com', 'Grace Lin', 'active', '2026-01-01 09:30:00'),
(8, '20260101', 'henry@example.com', 'Henry Zhou', 'inactive', '2026-01-01 09:35:00'),
(9, '20260101', 'iris@example.com', 'Iris Sun', 'active', '2026-01-01 09:40:00'),
(10, '20260101', 'jack@example.com', 'Jack Ma', 'active', '2026-01-01 09:45:00'),
(11, '20260101', 'kate@example.com', 'Kate Li', 'active', '2026-01-01 09:50:00'),   -- different status
(12, '20260101', 'leo@example.com', 'Leo Zhao', 'active', '2026-01-01 09:55:00'),
(13, '20260101', 'mia@example.com', 'Mia Chen', 'active', '2026-01-01 10:00:00'),
(14, '20260101', 'noah@example.com', 'Noah Wang Jr', 'inactive', '2026-01-01 10:05:00'),  -- different name
(15, '20260101', 'olivia@example.com', 'Olivia Zhang', 'active', '2026-01-01 10:10:00'),
(16, '20260101', 'paul@example.com', 'Paul Liu', 'active', '2026-01-01 10:15:00'),
(17, '20260101', 'quinn@example.com', 'Quinn Huang', 'active', '2026-01-01 10:20:00'),  -- different status
(18, '20260101', 'rachel@example.com', 'Rachel Wu', 'active', '2026-01-01 10:25:00'),
(19, '20260101', 'sam@example.com', 'Sam Lin', 'active', '2026-01-01 10:30:00'),
(20, '20260101', 'tina@example.com', 'Tina Zhou', 'inactive', '2026-01-01 10:35:00'),
(21, '20260101', 'uma@example.com', 'Uma Sun', 'active', '2026-01-01 10:40:00'),
(22, '20260101', 'victor@example.com', 'Victor Ma', 'active', '2026-01-01 10:45:00'),
(23, '20260101', 'wendy@example.com', 'Wendy Li', 'active', '2026-01-01 10:50:00'),  -- different status
(24, '20260101', 'xavier@example.com', 'Xavier Zhao', 'active', '2026-01-01 10:55:00'),
(25, '20260101', 'yuki@example.com', 'Yuki Chen', 'active', '2026-01-01 11:00:00'),
(26, '20260101', 'zack@example.com', 'Zack Wang', 'inactive', '2026-01-01 11:05:00'),
(27, '20260101', 'amy@example.com', 'Amy Zhang', 'active', '2026-01-01 11:10:00'),
(28, '20260101', 'ben@example.com', 'Ben Liu', 'active', '2026-01-01 11:15:00'),
(29, '20260101', 'chloe@example.com', 'Chloe Huang', 'active', '2026-01-01 11:20:00'),  -- different status
(30, '20260101', 'dan@example.com', 'Dan Wu', 'active', '2026-01-01 11:25:00'),
(31, '20260101', 'emma@example.com', 'Emma Lin', 'active', '2026-01-01 11:30:00'),
(32, '20260101', 'finn@example.com', 'Finn Zhou', 'inactive', '2026-01-01 11:35:00'),
(33, '20260101', 'gina@example.com', 'Gina Sun', 'active', '2026-01-01 11:40:00'),
(34, '20260101', 'hugo@example.com', 'Hugo Ma', 'active', '2026-01-01 11:45:00'),
(35, '20260101', 'ivy@example.com', 'Ivy Li', 'active', '2026-01-01 11:50:00'),  -- different status
(36, '20260101', 'jake@example.com', 'Jake Zhao', 'active', '2026-01-01 11:55:00'),
(37, '20260101', 'lily@example.com', 'Lily Chen', 'active', '2026-01-01 12:00:00'),
(38, '20260101', 'max@example.com', 'Max Wang', 'inactive', '2026-01-01 12:05:00'),
(39, '20260101', 'nina@example.com', 'Nina Zhang', 'active', '2026-01-01 12:10:00'),
(40, '20260101', 'owen@example.com', 'Owen Liu', 'active', '2026-01-01 12:15:00'),
(41, '20260101', 'pam@example.com', 'Pam Huang', 'active', '2026-01-01 12:20:00'),  -- different status
(42, '20260101', 'ryan@example.com', 'Ryan Wu', 'active', '2026-01-01 12:25:00'),
(43, '20260101', 'sara@example.com', 'Sara Lin', 'active', '2026-01-01 12:30:00'),
(44, '20260101', 'tom@example.com', 'Tom Zhou', 'inactive', '2026-01-01 12:35:00'),
(45, '20260101', 'una@example.com', 'Una Sun', 'active', '2026-01-01 12:40:00'),
-- IDs 46-50 missing in right (only in left)
(51, '20260101', 'new1@example.com', 'New User 1', 'active', '2026-01-01 13:10:00'),  -- only in right
(52, '20260101', 'new2@example.com', 'New User 2', 'active', '2026-01-01 13:11:00'),
(53, '20260101', 'new3@example.com', 'New User 3', 'active', '2026-01-01 13:12:00'),
(54, '20260101', 'new4@example.com', 'New User 4', 'active', '2026-01-01 13:13:00'),
(55, '20260101', 'new5@example.com', 'New User 5', 'active', '2026-01-01 13:14:00');

-- Register in datatools.table_registry (so they show in Assets)
INSERT INTO datatools.table_registry (env_schema, table_name, ddl, parsed_json)
VALUES
  ('dev', 'sample_users_left', 'CREATE TABLE dev.sample_users_left (...)', '{}'),
  ('dev', 'sample_users_right', 'CREATE TABLE dev.sample_users_right (...)', '{}')
ON CONFLICT (env_schema, table_name) DO UPDATE SET ddl = EXCLUDED.ddl;
