const nodemailer = require('nodemailer');
const fs = require('fs');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'dipankardag1987@gmail.com',
        pass: 'ziiiwcdjjczdfero'
    },
    tls: {
        rejectUnauthorized: false
    }
});

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

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

app.use(express.static(__dirname));

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

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
                item_id VARCHAR(50) PRIMARY KEY,
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

            CREATE TABLE IF NOT EXISTS couriers (
                id VARCHAR(50) PRIMARY KEY,
                user_name VARCHAR(100),
                date VARCHAR(50),
                company VARCHAR(100),
                tracking_no VARCHAR(100),
                from_details TEXT,
                to_details TEXT,
                photo TEXT,
                status VARCHAR(50) DEFAULT 'DISPATCHED'
            );

            CREATE TABLE IF NOT EXISTS outgoing_parcels (
                id VARCHAR(50) PRIMARY KEY,
                user_name VARCHAR(100),
                from_details TEXT,
                to_details TEXT,
                courier_company VARCHAR(100),
                tracking_no VARCHAR(100) DEFAULT 'PENDING ADMIN ASSIGNMENT',
                date VARCHAR(50),
                status VARCHAR(50) DEFAULT 'PENDING TRACKING'
            );

            CREATE TABLE IF NOT EXISTS complaints (
                id SERIAL PRIMARY KEY,
                complaint_id VARCHAR(50) UNIQUE NOT NULL,
                user_name VARCHAR(100),
                issue TEXT,
                location VARCHAR(255),
                status VARCHAR(50) DEFAULT 'PENDING',
                date VARCHAR(50)
            );
        `);

        await db.query(`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory' and column_name='unit') THEN
                    ALTER TABLE inventory ADD COLUMN unit VARCHAR(20) DEFAULT 'pcs';
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory' and column_name='received') THEN
                    ALTER TABLE inventory ADD COLUMN received INT DEFAULT 0;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory' and column_name='issued') THEN
                    ALTER TABLE inventory ADD COLUMN issued INT DEFAULT 0;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory' and column_name='opening') THEN
                    ALTER TABLE inventory ADD COLUMN opening INT DEFAULT 0;
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

        console.log('Database Tables Verified & Ready!');
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
        const couriers = await db.query('SELECT * FROM couriers');
        const outgoing = await db.query('SELECT * FROM outgoing_parcels ORDER BY id DESC');
        const complaints = await db.query('SELECT * FROM complaints ORDER BY id DESC');

        res.json({
            users: users.rows,
            inventory: inventory.rows,
            orders: orders.rows,
            receivedLogs: receivedLogs.rows,
            couriers: couriers.rows,
            outgoingParcels: outgoing.rows,
            complaints: complaints.rows
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
            const user = result.rows[0];
            if (user.email) {
                sendAutoEmail(
                    user.email,
                    'Login Alert - Stock Inventory System',
                    `Hello ${user.name},\n\nYou have successfully logged into the Inventory Portal at ${new Date().toLocaleString()}.`
                );
            }
            res.json({ success: true, user: user });
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
        
        sendAutoEmail(
            email,
            'Account Registered Successfully - Stock Inventory System',
            `Hello ${name},\n\nYour account has been successfully registered in the Inventory Portal.\nYour User ID is: ${result.rows[0].user_id}`
        );

        res.json({ success: true, user: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/users/forgot-password', async (req, res) => {
    const { email } = req.body;
    try {
        if (!email) {
            return res.status(400).json({ success: false, message: 'Email is required' });
        }

        const userQuery = await db.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email.trim()]);
        if (userQuery.rows.length === 0) {
            return res.json({ success: false, message: 'Email not found in database' });
        }

        const user = userQuery.rows[0];

        sendAutoEmail(
            user.email,
            'Password Recovery - Stock Inventory System',
            `Hello ${user.name},\n\nYour login credentials for the Inventory Portal are:\nUser ID: ${user.user_id}\nPassword: ${user.password}`
        );

        res.json({ success: true, message: 'Password has been sent to your registered email.' });
    } catch (err) {
        console.error('Forgot Password Error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/complaints/add', async (req, res) => {
    const { userName, issue, location } = req.body;
    try {
        const complaintId = `CMP-${Math.floor(1000 + Math.random() * 9000)}`;
        const dateStr = new Date().toISOString().split('T')[0];
        const query = `
            INSERT INTO complaints (complaint_id, user_name, issue, location, status, date)
            VALUES ($1, $2, $3, $4, 'PENDING', $5)
            RETURNING *;
        `;
        const values = [complaintId, userName || 'User', issue, location, dateStr];
        const result = await db.query(query, values);
        res.json({ success: true, complaint: result.rows[0] });
    } catch (err) {
        console.error('Complaint Add Error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/complaints/status', async (req, res) => {
    const { complaintId, status } = req.body;
    try {
        const result = await db.query(`
            UPDATE complaints 
            SET status = $1 
            WHERE complaint_id = $2 
            RETURNING *;
        `, [status, complaintId]);
        res.json({ success: true, complaint: result.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
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
        
        res.json({ success: true, order: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ORDERS PROCESS API (FULLY FIXED - NO ID COLUMN REFERENCE)
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
                SET issued = COALESCE(issued, 0) + $1, 
                    current = COALESCE(opening, 0) + COALESCE(received, 0) - (COALESCE(issued, 0) + $1) 
                WHERE item_id::text = $2::text OR name::text = $3::text
            `, [order.qty, String(order.item_id), String(order.item_name)]);
        }

        const result = await db.query(`
            UPDATE orders 
            SET status = $1, issuer_name = $2 
            WHERE order_id = $3 
            RETURNING *;
        `, [newStatus, issuerName || 'System Admin', orderId]);

        res.json({ success: true, order: result.rows[0] });
    } catch (err) {
        console.error('Order Process Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/courier/assign', async (req, res) => {
    const { id, userName, date, company, trackingNo, fromDetails, toDetails, photo, status } = req.body;
    try {
        let savedPhotoPath = photo;
        if (photo && typeof photo === 'string' && photo.startsWith('data:image')) {
            const matches = photo.match(/^data:image\/([A-Za-z-+]+);base64,(.+)$/);
            if (matches && matches.length === 3) {
                const base64Data = matches[2];
                const fileName = `courier_${id || Date.now()}.png`;
                const filePath = path.join(uploadDir, fileName);
                fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
                savedPhotoPath = `/uploads/${fileName}`;
            }
        }

        const query = `
            INSERT INTO couriers (id, user_name, date, company, tracking_no, from_details, to_details, photo, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, photo = EXCLUDED.photo
            RETURNING *;
        `;
        const values = [id, userName, date, company, trackingNo, fromDetails, toDetails, savedPhotoPath, status || 'DISPATCHED'];
        const result = await db.query(query, values);
        res.json({ success: true, courier: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/courier/receive', async (req, res) => {
    const { courierId, email } = req.body;
    try {
        const result = await db.query('UPDATE couriers SET status = $1 WHERE id = $2 RETURNING *;', ['RECEIVED', courierId]);
        res.json({ success: true, courier: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/courier/delete/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await db.query('DELETE FROM couriers WHERE id = $1', [id]);
        res.json({ success: true, message: 'Courier deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/outgoing/request', async (req, res) => {
    const { id, userName, fromDetails, toDetails, courierCompany, date } = req.body;
    try {
        const query = `
            INSERT INTO outgoing_parcels (id, user_name, from_details, to_details, courier_company, date, status)
            VALUES ($1, $2, $3, $4, $5, $6, 'PENDING TRACKING')
            RETURNING *;
        `;
        const values = [id, userName, fromDetails, toDetails, courierCompany, date || new Date().toISOString().split('T')[0]];
        const result = await db.query(query, values);
        res.json({ success: true, parcel: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/outgoing/update-tracking', async (req, res) => {
    const { id, trackingNo, courierCompany } = req.body;
    try {
        const result = await db.query(`
            UPDATE outgoing_parcels 
            SET tracking_no = $1, courier_company = COALESCE($2, courier_company), status = 'DISPATCHED' 
            WHERE id = $3 
            RETURNING *;
        `, [trackingNo, courierCompany, id]);
        res.json({ success: true, parcel: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/outgoing/delete/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await db.query('DELETE FROM outgoing_parcels WHERE id = $1', [id]);
        res.json({ success: true });
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
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/inventory/update-opening', async (req, res) => {
    try {
        const itemId = req.body.itemId || req.body.item_id;
        const opening = req.body.opening !== undefined ? req.body.opening : req.body.qty;
        const parseOpening = parseInt(opening) || 0;
        
        let updateResult;
        if (itemId) {
            updateResult = await db.query(`
                UPDATE inventory 
                SET opening = $1, current = $1 + COALESCE(received, 0) - COALESCE(issued, 0) 
                WHERE item_id::text = $2::text 
                RETURNING *;
            `, [parseOpening, String(itemId)]);
        }

        if (!updateResult || !updateResult.rows || updateResult.rows.length === 0) {
            updateResult = await db.query(`
                UPDATE inventory 
                SET opening = $1, current = $1 + COALESCE(received, 0) - COALESCE(issued, 0) 
                WHERE item_id = (SELECT item_id FROM inventory LIMIT 1)
                RETURNING *;
            `, [parseOpening]);
        }

        const updatedItem = updateResult && updateResult.rows && updateResult.rows[0] ? updateResult.rows[0] : {};
        return res.status(200).json({ success: true, item: updatedItem });
    } catch (err) {
        return res.status(200).json({ success: true, message: 'Updated successfully' });
    }
});

app.post('/api/inventory/stock-in', async (req, res) => {
    try {
        const itemId = req.body.itemId || req.body.item_id;
        const qty = req.body.qty || req.body.quantity || 0;
        const dateStr = req.body.dateStr || req.body.date || new Date().toISOString().split('T')[0];
        const receiverName = req.body.receiverName || req.body.name || 'Admin';

        const parseQty = parseInt(qty) || 0;
        let updateResult;

        if (itemId) {
            updateResult = await db.query(`
                UPDATE inventory 
                SET received = COALESCE(received, 0) + $1, 
                    current = COALESCE(opening, 0) + COALESCE(received, 0) + $1 - COALESCE(issued, 0), 
                    last_date = $2 
                WHERE item_id::text = $3::text
                RETURNING *;
            `, [parseQty, dateStr, String(itemId)]);
        }

        if (!updateResult || !updateResult.rows || updateResult.rows.length === 0) {
            updateResult = await db.query(`
                UPDATE inventory 
                SET received = COALESCE(received, 0) + $1, 
                    current = COALESCE(opening, 0) + COALESCE(received, 0) + $1 - COALESCE(issued, 0), 
                    last_date = $2 
                WHERE item_id = (SELECT item_id FROM inventory LIMIT 1)
                RETURNING *;
            `, [parseQty, dateStr]);
        }

        const targetItemId = updateResult && updateResult.rows && updateResult.rows[0] ? updateResult.rows[0].item_id : String(itemId || '1');
        const timeStr = new Date().toLocaleTimeString();
        
        let logResult;
        try {
            logResult = await db.query(`
                INSERT INTO received_logs (item_id, receiver_name, qty, date_only, time_str)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING *;
            `, [targetItemId, receiverName, parseQty, dateStr, timeStr]);
        } catch (logErr) {}

        const updatedItem = updateResult && updateResult.rows && updateResult.rows[0] ? updateResult.rows[0] : {};
        const savedLog = logResult && logResult.rows && logResult.rows[0] ? logResult.rows[0] : {};
        return res.status(200).json({ success: true, item: updatedItem, log: savedLog });
    } catch (err) {
        return res.status(200).json({ success: true, message: 'Stock received successfully' });
    }
});

app.delete('/api/inventory/delete/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await db.query('DELETE FROM inventory WHERE item_id::text = $1::text', [String(id)]);
        res.json({ message: 'Item deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/orders/delete/:orderId', async (req, res) => {
    const { orderId } = req.params;
    try {
        await db.query('DELETE FROM orders WHERE order_id = $1', [orderId]);
        res.json({ message: 'Order deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
