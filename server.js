const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'dipankardag1987@gmail.com',
        pass: 'ziiiwcdjjczdfero'
    }
});

// Email bhejne ka function
function sendAutoEmail(toEmail, subject, message) {
    const mailOptions = {
        from: 'dipankardag1987@gmail.com',
        to: toEmail,
        subject: subject,
        text: message
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.log('Email error:', error);
        } else {
            console.log('Email sent: ' + info.response);
        }
    });
}
const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

app.use(express.static(__dirname));

async function initDB() {
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(50) UNIQUE NOT NULL,
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
                item_id VARCHAR(50) UNIQUE NOT NULL,
                name VARCHAR(100) NOT NULL,
                category VARCHAR(100) NOT NULL,
                unit VARCHAR(20) DEFAULT 'pcs',
                opening INT DEFAULT 0,
                received INT DEFAULT 0,
                issued INT DEFAULT 0,
                current INT DEFAULT 0,
                last_date DATE DEFAULT CURRENT_DATE
            );

            CREATE TABLE IF NOT EXISTS orders (
                id SERIAL PRIMARY KEY,
                order_id VARCHAR(50) UNIQUE NOT NULL,
                user_name VARCHAR(100),
                issuer_name VARCHAR(100) DEFAULT 'System Admin',
                item_id VARCHAR(50),
                item_name VARCHAR(100),
                category VARCHAR(100),
                qty INT,
                time_str VARCHAR(50),
                date_only DATE DEFAULT CURRENT_DATE,
                status VARCHAR(50) DEFAULT 'UNDER PROCESS'
            );

            CREATE TABLE IF NOT EXISTS received_logs (
                id SERIAL PRIMARY KEY,
                item_id VARCHAR(50),
                receiver_name VARCHAR(100),
                qty INT,
                date_only DATE,
                time_str VARCHAR(50)
            );
        `);

        await db.query(`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory' and column_name='unit') THEN
                    ALTER TABLE inventory ADD COLUMN unit VARCHAR(20) DEFAULT 'pcs';
                END IF;
            END $$;
        `);

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

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'stock.html'));
});

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

app.post('/api/users/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const query = 'SELECT * FROM users WHERE (LOWER(email) = LOWER($1) OR LOWER(name) = LOWER($1)) AND password = $2';
        const result = await db.query(query, [username.trim(), password.trim()]);
        if (result.rows.length > 0) {
            res.json({ success: true, user: result.rows[0] });
        } else {
            res.json({ success: false });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/users/register', async (req, res) => {
    const { userId, name, email, password, dept, phone, role, status } = req.body;
    try {
        const query = `
            INSERT INTO users (user_id, name, email, password, dept, phone, role, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
            RETURNING *;
        `;
        const values = [userId || `USR-${Math.floor(100+Math.random()*900)}`, name, email, password, dept, phone, role || 'USER', status || 'ACTIVE'];
        const result = await db.query(query, values);
        
        // Auto Email Trigger on Registration
        sendAutoEmail(
            email,
            'Account Registered - Stock Inventory System',
            `Hello ${name},\n\nYour account has been successfully registered in the Inventory Portal.\nYour User ID: ${userId || 'User'}\n\nYou can now log in using your email and password.`
        );

        res.json({ success: true, user: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/users/status', async (req, res) => {
    const { userId, status } = req.body;
    try {
        const result = await db.query('UPDATE users SET status = $1 WHERE user_id = $2 RETURNING *;', [status, userId]);
        res.json({ success: true, user: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/users/delete/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        await db.query('DELETE FROM users WHERE user_id = $1', [userId]);
        res.json({ success: true, message: 'User deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/orders/create', async (req, res) => {
    const { orderId, user, itemId, itemName, category, qty, timeStr, dateOnly } = req.body;
    try {
        const query = `
            INSERT INTO orders (order_id, user_name, issuer_name, item_id, item_name, category, qty, time_str, date_only, status)
            VALUES ($1, $2, 'System Admin', $3, $4, $5, $6, $7, $8, 'UNDER PROCESS')
            RETURNING *;
        `;
        const values = [orderId, user, itemId, itemName, category, qty, timeStr, dateOnly || new Date().toISOString().split('T')[0]];
        const result = await db.query(query, values);
        
        // Fetch user email to send auto-notification
        const userQuery = await db.query('SELECT email FROM users WHERE name = $1', [user]);
        if (userQuery.rows.length > 0 && userQuery.rows[0].email) {
            sendAutoEmail(
                userQuery.rows[0].email,
                `New Requisition Order Submitted - ${orderId}`,
                `Hello ${user},\n\nYour requisition order for ${itemName} (Quantity: ${qty}) has been successfully submitted and is currently UNDER PROCESS.\n\nThank you.`
            );
        }

        res.json({ success: true, order: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

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

        // Fetch user email to notify status update
        const userQuery = await db.query('SELECT email FROM users WHERE name = $1', [order.user_name]);
        if (userQuery.rows.length > 0 && userQuery.rows[0].email) {
            sendAutoEmail(
                userQuery.rows[0].email,
                `Order Status Updated: ${orderId} is ${newStatus}`,
                `Hello ${order.user_name},\n\nYour order (${order.item_name}, Qty: ${order.qty}) status has been updated to: ${newStatus}.\nProcessed by: ${issuerName || 'System Admin'}`
            );
        }

        res.json({ success: true, order: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/inventory/add', async (req, res) => {
    const { name, category, unit, opening } = req.body;
    try {
        const itemId = String(Math.floor(1000 + Math.random() * 9000));
        const query = `
            INSERT INTO inventory (item_id, name, category, unit, opening, received, issued, current, last_date)
            VALUES ($1, $2, $3, $4, $5, 0, 0, $5, CURRENT_DATE)
            RETURNING *;
        `;
        const values = [itemId, name, category, unit || 'pcs', opening || 0];
        const result = await db.query(query, values);
        res.json({ success: true, item: result.rows[0] });
    } catch (err) {
        console.error('Add Item Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/inventory/delete/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await db.query('DELETE FROM inventory WHERE item_id = $1 OR id::text = $1', [id]);
        res.json({ message: 'Item deleted successfully from database' });
    } catch (err) {
        console.error('Delete Item Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

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
