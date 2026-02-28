-- Test INSERT for dev.ods_josephco_growth_hehers_di
-- Copy one of the statements below into the DataTools Run query page.

-- Option 1: Check table structure first (SELECT)
-- SELECT * FROM dev.ods_josephco_growth_hehers_di LIMIT 5;

-- Option 2: Insert 3 test rows
INSERT INTO dev.ods_josephco_growth_hehers_di (id, pt, email, name, status, created_at) VALUES
(1, '20260223', 'test1@example.com', 'Test User 1', 'active', NOW()),
(2, '20260223', 'test2@example.com', 'Test User 2', 'active', NOW()),
(3, '20260223', 'test3@example.com', 'Test User 3', 'pending', NOW());

-- Note: If your table has different columns, run the SELECT above to see the schema,
-- then adjust the INSERT column list and VALUES accordingly.
