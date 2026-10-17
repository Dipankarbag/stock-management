const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Serve static files from current directory
app.use(express.static(__dirname));

// PostgreSQL Database Connection
const db = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'stockflow_db',
    password: 'bag@1991A',
    port: 5432,
});

db.connect()
    .then(() => console.log('Successfully connected to Local PostgreSQL database!'))
    .catch(err => console.error('Database connection error:', err.stack));

// Initialize tables if not exist & insert default data
async function initDB() {
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS users (
                user_id VARCHAR(50) PRIMARY KEY,
                name VARCHAR(100),
                email VARCHAR(100) UNIQUE,
                password VARCHAR(100),
                dept VARCHAR(100),
                phone VARCHAR(50),
                role VARCHAR(20),
                status VARCHAR(20)
            );

            CREATE TABLE IF NOT EXISTS inventory (
                item_id SERIAL PRIMARY KEY,
                name VARCHAR(100),
                category VARCHAR(100),
                opening INT DEFAULT 0,
                received INT DEFAULT 0,
                issued INT DEFAULT 0,
                current INT DEFAULT 0,
                last_date DATE
            );

            CREATE TABLE IF NOT EXISTS orders (
                order_id VARCHAR(50) PRIMARY KEY,
                user_name VARCHAR(100),
                issuer_name VARCHAR(100),
                item_id VARCHAR(50),
                item_name VARCHAR(100),
                category VARCHAR(100),
                qty INT,
                time_str VARCHAR(50),
                date_only DATE,
                status VARCHAR(50)
            );

            CREATE TABLE IF NOT EXISTS received_logs (
                log_id SERIAL PRIMARY KEY,
                item_id VARCHAR(50),
                receiver_name VARCHAR(100),
                qty INT,
                date_only DATE,
                time_str VARCHAR(50)
            );
        `);

        // Insert default admin if not exists
        const adminCheck = await db.query("SELECT * FROM users WHERE role = 'ADMIN'");
        if (adminCheck.rows.length === 0) {
            await db.query(`
                INSERT INTO users (user_id, name, email, password, dept, phone, role, status)
                VALUES ('USR-001', 'System Admin', 'dipankardag1987@gmail.com', '123', 'IT & Admin', '+91 9876543210', 'ADMIN', 'ACTIVE')
                ON CONFLICT (email) DO NOTHING;
            `);
        }

        console.log('Database Tables Verified & Default Admin Ready!');
    } catch (err) {
        console.error('Init DB Error:', err.message);
    }
}
initDB();

// Root Route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'stock.html'));
});

// Get State API
app.get('/api/state', async (req, res) => {
    try {
        const users = await db.query('SELECT * FROM users');
        const inventory = await db.query('SELECT * FROM inventory');
        const orders = await db.query('SELECT * FROM orders');
        const receivedLogs = await db.query('SELECT * FROM received_logs');

        res.json({
            users: users.rows,
            inventory: inventory.rows,
            orders: orders.rows,
            receivedLogs: receivedLogs.rows
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Login API
app.post('/api/users/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const query = 'SELECT * FROM users WHERE (LOWER(email) = LOWER($1) OR LOWER(name) = LOWER($1)) AND password = $2';
        const result = await db.query(query, [username, password]);
        if (result.rows.length > 0) {
            res.json({ success: true, user: result.rows[0] });
        } else {
            res.json({ success: false });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Register API
app.post('/api/users/register', async (req, res) => {
    const { userId, name, email, password, dept, phone, role, status } = req.body;
    try {
        const query = `
            INSERT INTO users (user_id, name, email, password, dept, phone, role, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
            RETURNING *;
        `;
        const values = [userId, name, email, password, dept, phone, role || 'USER', status || 'ACTIVE'];
        const result = await db.query(query, values);
        res.json({ success: true, user: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create Order API
app.post('/api/orders/create', async (req, res) => {
    const { orderId, user, itemId, itemName, category, qty, timeStr, dateOnly } = req.body;
    try {
        const query = `
            INSERT INTO orders (order_id, user_name, issuer_name, item_id, item_name, category, qty, time_str, date_only, status)
            VALUES ($1, $2, 'System Admin', $3, $4, $5, $6, $7, $8, 'UNDER PROCESS')
            RETURNING *;
        `;
        const values = [orderId, user, itemId, itemName, category, qty, timeStr, dateOnly];
        const result = await db.query(query, values);
        res.json({ success: true, order: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Process Order API
app.post('/api/orders/process', async (req, res) => {
    const { orderId, action, issuerName } = req.body;
    try {
        let newStatus = 'UNDER PROCESS';
        if (action === 'APPROVE') newStatus = 'APPROVED';
        else if (action === 'ISSUE') newStatus = 'ISSUED';
        else if (action === 'REJECT') newStatus = 'REJECTED';

        const orderQuery = await db.query('SELECT * FROM orders WHERE order_id = $1', [orderId]);
        if (orderQuery.rows.length === 0) return res.status(404).json({ error: 'Order not found' });
        const order = orderQuery.rows[0];

        if (action === 'ISSUE') {
            await db.query(`
                UPDATE inventory 
                SET issued = issued + $1, current = current - $1 
                WHERE item_id = $2
            `, [order.qty, order.item_id]);
        }

        const result = await db.query(`
            UPDATE orders 
            SET status = $1, issuer_name = $2 
            WHERE order_id = $3 
            RETURNING *;
        `, [newStatus, issuerName, orderId]);

        res.json({ success: true, order: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Add New Item API (Fixed)
app.post('/api/inventory/add', async (req, res) => {
    const { name, category, opening } = req.body;
    try {
        const query = `
            INSERT INTO inventory (name, category, opening, received, issued, current, last_date)
            VALUES ($1, $2, $3, 0, 0, $3, CURRENT_DATE)
            RETURNING *;
        `;
        const values = [name, category, opening || 0];
        const result = await db.query(query, values);
        res.json({ success: true, item: result.rows[0] });
    } catch (err) {
        console.error('Add Item Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Update Opening Quantity API
app.post('/api/inventory/update-opening', async (req, res) => {
    const { itemId, newOpening } = req.body;
    try {
        const itemQuery = await db.query('SELECT * FROM inventory WHERE item_id = $1', [itemId]);
        if (itemQuery.rows.length === 0) return res.status(404).json({ error: 'Item not found' });
        const item = itemQuery.rows[0];

        const newCurrent = newOpening + item.received - item.issued;

        const result = await db.query(`
            UPDATE inventory 
            SET opening = $1, current = $2 
            WHERE item_id = $3 
            RETURNING *;
        `, [newOpening, newCurrent, itemId]);

        res.json({ success: true, item: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Stock In API
app.post('/api/inventory/stock-in', async (req, res) => {
    const { itemId, qty, dateStr, receiver } = req.body;
    try {
        await db.query(`
            UPDATE inventory 
            SET received = received + $1, current = current + $1, last_date = $2 
            WHERE item_id = $3
        `, [qty, dateStr, itemId]);

        await db.query(`
            INSERT INTO received_logs (item_id, receiver_name, qty, date_only, time_str)
            VALUES ($1, $2, $3, $4, $5)
        `, [itemId, receiver, qty, dateStr, new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })]);

        res.json({ success: true, message: 'Stock received logged successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete Inventory Item API
app.delete('/api/inventory/delete/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await db.query('DELETE FROM inventory WHERE item_id = $1', [id]);
        res.json({ message: 'Item deleted successfully from database' });
    } catch (err) {
        console.error('Delete Item Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Delete Order API
app.delete('/api/orders/delete/:orderId', async (req, res) => {
    const { orderId } = req.params;
    try {
        await db.query('DELETE FROM orders WHERE order_id = $1', [orderId]);
        res.json({ message: 'Order deleted successfully from database' });
    } catch (err) {
        console.error('Delete Order Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
