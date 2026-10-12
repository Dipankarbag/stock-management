const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const path = require('path'); // Added path module
const db = require('./db');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Serve HTML & Static Files
app.use(express.static(__dirname));

// Root route - Load stock.html directly
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'stock.html'));
});

// Nodemailer SMTP Transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Helper: Send Automatic Mail Notification to Users
async function sendOrderEmail(userEmail, userName, itemName, qty, status, issuerName) {
    if(!process.env.EMAIL_USER || process.env.EMAIL_USER === 'your_gmail_address@gmail.com') {
        console.log('Skipping email send: EMAIL_USER credentials not configured in .env');
        return;
    }

    const mailOptions = {
        from: `"StockFlow System" <${process.env.EMAIL_USER}>`,
        to: userEmail,
        subject: `Requisition Order ${status} - ${itemName}`,
        html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; border: 1px solid #ddd; border-radius: 8px;">
                <h2 style="color: #2563eb;">StockFlow Requisition Status Update</h2>
                <p>Hello <strong>${userName}</strong>,</p>
                <p>Your item requisition order has been updated to <strong>${status}</strong>.</p>
                
                <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
                    <tr style="background-color: #f8fafc;">
                        <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Item Name</th>
                        <td style="padding: 10px; border: 1px solid #ddd;">${itemName}</td>
                    </tr>
                    <tr>
                        <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Quantity Requested</th>
                        <td style="padding: 10px; border: 1px solid #ddd;">${qty} Units</td>
                    </tr>
                    <tr style="background-color: #f8fafc;">
                        <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Issuer / Admin Name</th>
                        <td style="padding: 10px; border: 1px solid #ddd;">${issuerName}</td>
                    </tr>
                </table>

                <p style="margin-top: 20px; font-size: 12px; color: #64748b;">Automated notification from StockFlow Inventory System.</p>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`Automatic email notification sent to ${userEmail}`);
    } catch (err) {
        console.error('Email Notification Error:', err.message);
    }
}

// 1. Get System State
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

// 2. Add New Item
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

// 3. Stock In Entry
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
        res.json({ message: 'Stock In Recorded' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. Create New Order
app.post('/api/orders/create', async (req, res) => {
    const { orderId, userName, itemId, itemName, category, qty, timeStr, dateOnly } = req.body;
    try {
        await db.query(
            'INSERT INTO orders (order_id, user_name, item_id, item_name, category, qty, time_str, date_only, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
            [orderId, userName, itemId, itemName, category, qty, timeStr, dateOnly, 'UNDER PROCESS']
        );
        res.json({ message: 'Order Created Successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 5. Protected Opening Quantity Update
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
        res.json({ message: 'Opening quantity updated' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 6. Order Status Processing & Automatic Email Notification
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
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
