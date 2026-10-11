-- Database: stockflow_db Setup Script

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    dept VARCHAR(100),
    phone VARCHAR(20),
    role VARCHAR(20) DEFAULT 'USER',
    status VARCHAR(20) DEFAULT 'ACTIVE'
);

CREATE TABLE IF NOT EXISTS inventory (
    id SERIAL PRIMARY KEY,
    item_id VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(150) NOT NULL,
    category VARCHAR(100) NOT NULL,
    opening INT DEFAULT 0,
    received INT DEFAULT 0,
    issued INT DEFAULT 0,
    current INT DEFAULT 0,
    last_date DATE DEFAULT CURRENT_DATE
);

CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    order_id VARCHAR(50) UNIQUE NOT NULL,
    user_name VARCHAR(100) NOT NULL,
    issuer_name VARCHAR(100) DEFAULT 'N/A',
    item_id VARCHAR(50) REFERENCES inventory(item_id) ON DELETE CASCADE,
    item_name VARCHAR(150) NOT NULL,
    category VARCHAR(100) NOT NULL,
    qty INT NOT NULL,
    time_str VARCHAR(30),
    date_only DATE DEFAULT CURRENT_DATE,
    status VARCHAR(30) DEFAULT 'UNDER PROCESS'
);

CREATE TABLE IF NOT EXISTS received_logs (
    id SERIAL PRIMARY KEY,
    item_id VARCHAR(50) REFERENCES inventory(item_id) ON DELETE CASCADE,
    receiver_name VARCHAR(100) NOT NULL,
    qty INT NOT NULL,
    date_only DATE NOT NULL,
    time_str VARCHAR(20) NOT NULL
);

-- Default Data Initial Import
INSERT INTO users (user_id, name, email, password, dept, phone, role, status) VALUES
('USR-001', 'System Admin', 'admin@stockflow.com', '123', 'IT & Admin', '+91 9876543210', 'ADMIN', 'ACTIVE'),
('USR-002', 'Rahul Sharma', 'rahul@company.com', '123', 'Operations', '+91 9123456789', 'USER', 'ACTIVE')
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO inventory (item_id, name, category, opening, received, issued, current, last_date) VALUES
('1', 'A4 Paper Rim', 'Stationery', 150, 10, 30, 130, '2026-10-05'),
('2', 'Ball Pens Box', 'Stationery', 20, 5, 10, 15, '2026-10-08'),
('3', 'Dell USB Mouse', 'IT Hardware', 10, 0, 5, 5, '2026-10-01'),
('4', 'Logitech Keyboard', 'IT Hardware', 8, 2, 8, 2, '2026-10-09'),
('5', 'Hand Sanitizer 500ml', 'Cleaning', 50, 10, 5, 55, '2026-10-11')
ON CONFLICT (item_id) DO NOTHING;