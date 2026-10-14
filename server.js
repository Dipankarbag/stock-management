const path = require('path');
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const db = require('./db');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Serve static frontend files
app.use(express.static(__dirname));

// Root Route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'stock.html'));
});

// Auto-Create Database Tables Function
async function initDatabase() {
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(50) UNIQUE,
                name VARCHAR(100),
                email VARCHAR(100) UNIQUE,
                password VARCHAR(100),
                dept VARCHAR(100),
                phone VARCHAR(50),
                role VARCHAR(20) DEFAULT 'USER',
                status VARCHAR(20) DEFAULT 'ACTIVE'
            );

            CREATE TABLE IF NOT EXISTS inventory (
                id SERIAL PRIMARY KEY,
                item_id VARCHAR(50) UNIQUE,
                name VARCHAR(100),
                category VARCHAR(100),
                opening INT DEFAULT 0,
                received INT DEFAULT 0,
                issued INT DEFAULT 0,
                current INT DEFAULT 0,
                last_date VARCHAR(50)
            );

            CREATE TABLE IF NOT EXISTS orders (
                id SERIAL PRIMARY KEY,
                order_id VARCHAR(50) UNIQUE,
                user_name VARCHAR(100),
                issuer_name VARCHAR(100),
                item_id VARCHAR(50),
                item_name VARCHAR(100),
                category VARCHAR(100),
                qty INT,
                time_str VARCHAR(50),
                date_only VARCHAR(50),
                status VARCHAR(50) DEFAULT 'UNDER PROCESS'
            );

            CREATE TABLE IF NOT EXISTS received_logs (
                id SERIAL PRIMARY KEY,
                item_id VARCHAR(50),
                receiver_name VARCHAR(100),
                qty INT,
                date_only VARCHAR(50),
                time_str VARCHAR(50)
            );
        `);

        // Insert Default Admin User into DB if missing
        await db.query(`
            INSERT INTO users (user_id, name, email, password, dept, phone, role, status)
            VALUES ('USR-001', 'System Admin', 'dipankardag1987@gmail.com', '123', 'IT & Admin', '+91 9876543210', 'ADMIN', 'ACTIVE')
            ON CONFLICT (email) DO NOTHING;
        `);

        console.log("Database Tables Verified & Default Admin Ready!");
    } catch (err) {
        console.error("Database Init Error:", err.message);
    }
}
initDatabase();

// Nodemailer Transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Email Notification Function
async function sendOrderEmail(userEmail, userName, itemName, qty, status, issuerName) {
    if(!process.env.EMAIL_USER || process.env.EMAIL_USER === 'your_gmail_address@gmail.com') return;

    const mailOptions = {
        from: `"StockFlow System" <${process.env.EMAIL_USER}>`,
        to: userEmail,
        subject: `Requisition Order ${status} - ${itemName}`,
        html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; border: 1px solid #ddd; border-radius: 8px;">
                <h2 style="color: #2563eb;">StockFlow Requisition Status Update</h2>
                <p>Hello <strong>${userName}</strong>,</p>
                <p>Your item requisition order status has been updated to <strong>${status}</strong>.</p>
                <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
                    <tr style="background-color: #f8fafc;"><th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Item Name</th><td style="padding: 10px; border: 1px solid #ddd;">${itemName}</td></tr>
                    <tr><th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Quantity</th><td style="padding: 10px; border: 1px solid #ddd;">${qty} Units</td></tr>
                    <tr style="background-color: #f8fafc;"><th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Issuer</th><td style="padding: 10px; border: 1px solid #ddd;">${issuerName}</td></tr>
                </table>
            </div>
        `
    };

    try { await transporter.sendMail(mailOptions); } catch (err) { console.error('Email Error:', err.message); }
}

// 1. Get Complete System State from DB
app.get('/api/state', async (req, res) => {
    try {
        const users = await db.query('SELECT * FROM users ORDER BY id ASC');
        const inventory = await db.query('SELECT * FROM inventory ORDER BY id ASC');
        const orders = await db.query('SELECT * FROM orders ORDER BY id DESC');
        const receivedLogs = await db.query('SELECT * FROM received_logs ORDER BY id DESC');

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

// 2. Register New User Route (Saves to DB)
app.post('/api/users/register', async (req, res) => {
    const { userId, name, email, password, dept, phone, role, status } = req.body;
    const cleanEmail = email ? email.trim().toLowerCase() : '';
    const cleanPassword = password ? password.trim() : '';

    try {
        const insertRes = await db.query(
            `INSERT INTO users (user_id, name, email, password, dept, phone, role, status) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, password = EXCLUDED.password, dept = EXCLUDED.dept, phone = EXCLUDED.phone
             RETURNING *`,
            [userId, name.trim(), cleanEmail, cleanPassword, dept, phone, role || 'USER', status || 'ACTIVE']
        );
        res.json({ message: 'User Registered Successfully', user: insertRes.rows[0] });
    } catch (err) {
        console.error('Registration API Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// 3. User Login Verification Route
app.post('/api/users/login', async (req, res) => {
    const { username, password } = req.body;
    const cleanUsername = username ? username.trim().toLowerCase() : '';
    const cleanPassword = password ? password.trim() : '';

    try {
        const userRes = await db.query(
            'SELECT * FROM users WHERE (LOWER(TRIM(email)) = $1 OR LOWER(TRIM(name)) = $1) AND TRIM(password) = $2',
            [cleanUsername, cleanPassword]
        );

        if (userRes.rows.length > 0) {
            const u = userRes.rows[0];
            res.json({
                success: true,
                user: {
                    id: u.user_id,
                    name: u.name,
                    email: u.email,
                    dept: u.dept,
                    phone: u.phone,
                    role: u.role,
                    status: u.status
                }
            });
        } else {
            res.status(401).json({ success: false, message: 'Invalid Credentials' });
        }
    } catch (err) {
        console.error('Login API Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// 4. Add Inventory Item
app.post('/api/inventory/add', async (req, res) => {
    const { name, category, opening } = req.body;
    try {
        const countRes = await db.query('SELECT COUNT(*) FROM inventory');
        const nextId = (parseInt(countRes.rows[0].count) + 1).toString();
        const lastDate = new Date().toISOString().split('T')[0];

        await db.query(
            'INSERT INTO inventory (item_id, name, category, opening, received, issued, current, last_date) VALUES ($1, $2, $3, $4, 0, 0, $4, $5)',
            [nextId, name, category, opening, lastDate]
        );
        res.json({ message: 'Item Added Successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 5. Stock In Entry
app.post('/api/inventory/stock-in', async (req, res) => {
    const { itemId, qty, dateStr, receiver } = req.body;
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    try {
        await db.query(
            'INSERT INTO received_logs (item_id, receiver_name, qty, date_only, time_str) VALUES ($1, $2, $3, $4, $5)',
            [itemId, receiver, qty, dateStr, timeStr]
        );
        await db.query(
            'UPDATE inventory SET received = received + $1, current = current + $1, last_date = $2 WHERE item_id = $3',
            [qty, dateStr, itemId]
        );
        res.json({ message: 'Stock In Recorded Successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 6. Update Opening Quantity
app.post('/api/inventory/update-opening', async (req, res) => {
    const { itemId, newOpening } = req.body;
    try {
        const itemRes = await db.query('SELECT received, issued FROM inventory WHERE item_id = $1', [itemId]);
        if (itemRes.rows.length === 0) return res.status(404).json({ error: 'Item not found' });
        
        const item = itemRes.rows[0];
        const newCurrent = parseInt(newOpening) + item.received - item.issued;

        await db.query(
            'UPDATE inventory SET opening = $1, current = $2 WHERE item_id = $3',
            [newOpening, newCurrent, itemId]
        );
        res.json({ message: 'Opening quantity updated successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 7. Submit Order Requisition (SAVED TO POSTGRESQL)
app.post('/api/orders/create', async (req, res) => {
    const { orderId, user, itemId, itemName, category, qty, timeStr, dateOnly } = req.body;
    try {
        await db.query(
            `INSERT INTO orders (order_id, user_name, issuer_name, item_id, item_name, category, qty, time_str, date_only, status) 
             VALUES ($1, $2, 'N/A', $3, $4, $5, $6, $7, $8, 'UNDER PROCESS')
             ON CONFLICT (order_id) DO NOTHING`,
            [orderId, user, itemId, itemName, category, qty, timeStr, dateOnly]
        );
        res.json({ message: 'Order created and saved to database successfully' });
    } catch (err) {
        console.error('Order API Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// 8. Process Order Request
app.post('/api/orders/process', async (req, res) => {
    const { orderId, action, issuerName } = req.body;
    try {
        const orderRes = await db.query('SELECT * FROM orders WHERE order_id = $1', [orderId]);
        if (orderRes.rows.length === 0) return res.status(404).json({ error: 'Order not found' });

        const order = orderRes.rows[0];
        let newStatus = action === 'APPROVE' ? 'APPROVED' : (action === 'ISSUE' ? 'ISSUED' : 'REJECTED');

        await db.query(
            'UPDATE orders SET status = $1, issuer_name = $2 WHERE order_id = $3',
            [newStatus, issuerName, orderId]
        );

        if (action === 'ISSUE') {
            await db.query(
                'UPDATE inventory SET issued = issued + $1, current = current - $1 WHERE item_id = $2',
                [order.qty, order.item_id]
            );
        }

        const userRes = await db.query('SELECT email FROM users WHERE name = $1', [order.user_name]);
        if (userRes.rows.length > 0) {
            sendOrderEmail(userRes.rows[0].email, order.user_name, order.item_name, order.qty, newStatus, issuerName);
        }

        res.json({ message: 'Order processed successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
