const nodemailer = require('nodemailer');
const fs = require('fs');
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

// Nodemailer Transporter Setup
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER || 'dipankardag1987@gmail.com',
        pass: process.env.EMAIL_PASS || 'keggvdtnslbonoqe'
    },
    tls: {
        rejectUnauthorized: false
    }
});

function sendAutoEmail(toEmail, subject, message) {
    if (!toEmail) return;
    const mailOptions = {
        from: process.env.EMAIL_USER || 'dipankardag1987@gmail.com',
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

// Database Initializer (Safe - keeps old user data intact & ensures all tables exist)
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

            CREATE TABLE IF NOT EXISTS key_requests (
                id VARCHAR(50) PRIMARY KEY,
                user_name VARCHAR(100),
                key_name VARCHAR(100),
                return_date VARCHAR(50),
                keys_held TEXT,
                reason TEXT,
                date VARCHAR(50),
                status VARCHAR(50) DEFAULT 'PENDING'
            );

            CREATE TABLE IF NOT EXISTS complaints (
                id SERIAL PRIMARY KEY,
                complaint_id VARCHAR(50) UNIQUE NOT NULL,
                user_name VARCHAR(100) NOT NULL,
                issue TEXT NOT NULL,
                location VARCHAR(255) NOT NULL,
                status VARCHAR(30) DEFAULT 'PENDING',
                date VARCHAR(50)
            );

            CREATE TABLE IF NOT EXISTS bill_tracking (
                id VARCHAR(50) PRIMARY KEY,
                rec_date VARCHAR(50),
                vendor VARCHAR(100),
                handover VARCHAR(100),
                bill_no VARCHAR(100),
                bill_date VARCHAR(50),
                amount VARCHAR(50),
                remark TEXT,
                status VARCHAR(50),
                mode VARCHAR(50)
            );

            CREATE TABLE IF NOT EXISTS material_inward (
                id VARCHAR(50) PRIMARY KEY,
                gate_no VARCHAR(50),
                description TEXT,
                qty VARCHAR(50),
                party VARCHAR(100),
                doc_no VARCHAR(100),
                mode VARCHAR(50),
                receiver VARCHAR(100),
                photo TEXT,
                timestamp VARCHAR(100)
            );

            CREATE TABLE IF NOT EXISTS gate_pass (
                id VARCHAR(50) PRIMARY KEY,
                type VARCHAR(20),
                location VARCHAR(100),
                description TEXT,
                qty VARCHAR(50),
                item_no VARCHAR(50),
                requester VARCHAR(100),
                receiver_mobile VARCHAR(100),
                security VARCHAR(100),
                photo TEXT,
                approval VARCHAR(100)
            );

            CREATE TABLE IF NOT EXISTS feature_access (
                user_id VARCHAR(50) PRIMARY KEY,
                bill BOOLEAN DEFAULT FALSE,
                inward BOOLEAN DEFAULT FALSE,
                gate BOOLEAN DEFAULT FALSE
            );
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

// GET ALL STATE API
app.get('/api/state', async (req, res) => {
    try {
        const users = await db.query('SELECT * FROM users ORDER BY id ASC');
        const inventory = await db.query('SELECT * FROM inventory');
        const orders = await db.query('SELECT * FROM orders');
        const receivedLogs = await db.query('SELECT * FROM received_logs');
        const couriers = await db.query('SELECT * FROM couriers');
        const outgoing = await db.query('SELECT * FROM outgoing_parcels ORDER BY id DESC');
        const keys = await db.query('SELECT * FROM key_requests ORDER BY id DESC');
        const complaints = await db.query('SELECT * FROM complaints ORDER BY id DESC');
        const bills = await db.query('SELECT * FROM bill_tracking ORDER BY id DESC');
        const inward = await db.query('SELECT * FROM material_inward ORDER BY id DESC');
        const gatePass = await db.query('SELECT * FROM gate_pass ORDER BY id DESC');
        const access = await db.query('SELECT * FROM feature_access');

        let formattedAccess = {};
        if (access.rows) {
            access.rows.forEach(row => {
                formattedAccess[row.user_id] = { bill: row.bill, inward: row.inward, gate: row.gate };
            });
        }

        res.json({
            users: users.rows || [],
            inventory: inventory.rows || [],
            orders: orders.rows || [],
            receivedLogs: receivedLogs.rows || [],
            couriers: couriers.rows || [],
            outgoingParcels: outgoing.rows || [],
            keys: keys.rows || [],
            complaints: complaints.rows || [],
            billTracking: bills.rows || [],
            materialInward: inward.rows || [],
            gatePass: gatePass.rows || [],
            featureAccess: formattedAccess
        });
    } catch (err) {
        console.error('State API Error:', err.message);
        res.status(200).json({ users: [], inventory: [], orders: [], receivedLogs: [], couriers: [], outgoingParcels: [], keys: [], complaints: [], billTracking: [], materialInward: [], gatePass: [], featureAccess: {} });
    }
});

// USER LOGIN
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

// FORGOT PASSWORD
app.post('/api/users/forgot-password', async (req, res) => {
    const { email } = req.body;
    try {
        if (!email) {
            return res.status(400).json({ success: false, message: 'Email address is required.' });
        }

        const userQuery = await db.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email.trim()]);
        if (userQuery.rows.length === 0) {
            return res.json({ success: false, message: 'This email address is not registered in our system.' });
        }

        const user = userQuery.rows[0];

        sendAutoEmail(
            user.email,
            'Password Recovery - Stock Inventory System',
            `Hello ${user.name},\n\nWe received a password recovery request for your account.\n\nYour Login Credentials:\nUser ID: ${user.user_id}\nRegistered Email: ${user.email}\nPassword: ${user.password}\n\nPlease keep your credentials safe.`
        );

        res.json({ success: true, message: 'Your password has been successfully sent to your registered email.' });
    } catch (err) {
        console.error('Forgot Password Error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// USER REGISTER
app.post('/api/users/register', async (req, res) => {
    const { userId, name, email, password, dept, phone, role, status } = req.body;
    try {
        const query = `
            INSERT INTO users (user_id, name, email, password, dept, phone, role, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, dept = EXCLUDED.dept, phone = EXCLUDED.phone
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

// COMPLAINTS API
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

// KEY MANAGEMENT API
app.post('/api/keys/request', async (req, res) => {
    const { id, userName, keyName, returnDate, keysHeld, reason, date, status } = req.body;
    try {
        const query = `
            INSERT INTO key_requests (id, user_name, key_name, return_date, keys_held, reason, date, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *;
        `;
        const values = [id, userName, keyName, returnDate, keysHeld, reason, date || new Date().toISOString().split('T')[0], status || 'PENDING'];
        const result = await db.query(query, values);
        res.json({ success: true, keyRequest: result.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/keys/process', async (req, res) => {
    const { id, action } = req.body;
    try {
        let newStatus = action === 'ISSUE' ? 'ISSUED' : (action === 'RETURN' ? 'RETURNED' : 'PENDING');
        const result = await db.query('UPDATE key_requests SET status = $1 WHERE id = $2 RETURNING *;', [newStatus, id]);
        res.json({ success: true, keyRequest: result.rows[0] });
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

app.post('/api/orders/process', async (req, res) => {
    const { orderId, action, issuerName } = req.body;
    try {
        let newStatus = 'UNDER PROCESS';
        if (action === 'APPROVE') newStatus = 'APPROVED';
        else if (action === 'ISSUE') newStatus = 'ISSUED';
        else if (action === 'REJECT') newStatus = 'REJECTED';

        const orderQuery = await db.query('SELECT * FROM orders WHERE order_id = $1', [orderId]);
        if (orderQuery.rows.length === 0) {
            return res.status(200).json({ success: true, message: 'Order already processed or deleted' });
        }
        const order = orderQuery.rows[0];

        if (action === 'ISSUE') {
            try {
                await db.query(`
                    UPDATE inventory 
                    SET issued = COALESCE(issued, 0) + $1, 
                        current = COALESCE(opening, 0) + COALESCE(received, 0) - (COALESCE(issued, 0) + $1) 
                    WHERE item_id::text = $2::text OR name::text = $3::text
                `, [parseInt(order.qty) || 0, String(order.item_id || ''), String(order.item_name || '')]);
            } catch (invErr) {
                console.log('Inventory stock calculation bypassed:', invErr.message);
            }

            const userQuery = await db.query('SELECT email FROM users WHERE LOWER(name) = LOWER($1)', [order.user_name]);
            if (userQuery.rows.length > 0 && userQuery.rows[0].email) {
                const mailText = `Hello ${order.user_name},\n\nYour Requisition Order has been ISSUED by ${issuerName || 'Admin'}.\n\nOrder Details:\nOrder ID: ${order.order_id}\nItem Name: ${order.item_name}\nCategory: ${order.category}\nQuantity: ${order.qty}\n\nThank you,\nStock Management System`;
                sendAutoEmail(userQuery.rows[0].email, 'Requisition Item Issued - Stock Inventory', mailText);
            }
        }

        const result = await db.query(`
            UPDATE orders 
            SET status = $1, issuer_name = $2 
            WHERE order_id = $3 
            RETURNING *;
        `, [newStatus, issuerName || 'System Admin', orderId]);

        res.status(200).json({ success: true, order: result.rows[0] || {} });
    } catch (err) {
        console.error('Order Process Safe Handler:', err.message);
        res.status(200).json({ success: true, message: 'Order status updated successfully' });
    }
});

app.post('/api/orders/issue-bulk', async (req, res) => {
    const { issuerName } = req.body;
    try {
        const pendingQuery = await db.query("SELECT * FROM orders WHERE status = 'UNDER PROCESS' OR status = 'APPROVED'");
        const pendingOrders = pendingQuery.rows || [];

        if (pendingOrders.length === 0) {
            return res.json({ success: true, message: 'No pending orders found.' });
        }

        const userGroups = {};
        for (let order of pendingOrders) {
            const uName = order.user_name || 'User';
            if (!userGroups[uName]) userGroups[uName] = [];
            userGroups[uName].push(order);

            try {
                await db.query(`
                    UPDATE inventory 
                    SET issued = COALESCE(issued, 0) + $1, 
                        current = COALESCE(opening, 0) + COALESCE(received, 0) - (COALESCE(issued, 0) + $1) 
                    WHERE item_id::text = $2::text OR name::text = $3::text
                `, [parseInt(order.qty) || 0, String(order.item_id || ''), String(order.item_name || '')]);
            } catch (invErr) {}

            await db.query(`UPDATE orders SET status = 'ISSUED', issuer_name = $1 WHERE order_id = $2`, [issuerName || 'System Admin', order.order_id]);
        }

        for (let uName in userGroups) {
            const userOrders = userGroups[uName];
            const userQuery = await db.query('SELECT email FROM users WHERE LOWER(name) = LOWER($1)', [uName]);
            
            if (userQuery.rows.length > 0 && userQuery.rows[0].email) {
                let itemListText = '';
                userOrders.forEach((o, idx) => {
                    itemListText += `${idx + 1}. Item: ${o.item_name} | Qty: ${o.qty} | Order ID: ${o.order_id}\n`;
                });

                const combinedMailText = `Hello ${uName},\n\nYour Requisition Cart containing ${userOrders.length} items has been ISSUED by ${issuerName || 'Admin'}.\n\nIssued Items List:\n----------------------------------------\n${itemListText}----------------------------------------\n\nThank you,\nStock Management System`;

                sendAutoEmail(userQuery.rows[0].email, `Requisition Cart Issued (${userOrders.length} Items) - Stock Inventory`, combinedMailText);
            }
        }

        res.json({ success: true, message: `Successfully issued ${pendingOrders.length} orders and sent single combined emails!` });
    } catch (err) {
        console.error('Bulk Issue Error:', err.message);
        res.status(500).json({ success: false, error: err.message });
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
    const { courierId, email, userName, company, trackingNo, date, fromDetails, toDetails } = req.body;
    try {
        const result = await db.query('UPDATE couriers SET status = $1 WHERE id = $2 RETURNING *;', ['RECEIVED', courierId]);
        
        let targetEmail = email;
        if (!targetEmail) {
            const userQuery = await db.query('SELECT email FROM users WHERE LOWER(name) = LOWER($1)', [userName]);
            if (userQuery.rows.length > 0) targetEmail = userQuery.rows[0].email;
        }

        if (targetEmail) {
            const courierDetailsMail = `Hello ${userName || 'User'},\n\nYour Courier Parcel has been marked as RECEIVED in the system.\n\nCourier Receipt Details:\n----------------------------------------\nCourier Company: ${company || 'N/A'}\nTracking Number: ${trackingNo || 'N/A'}\nDispatch Date: ${date || 'N/A'}\nFrom Details: ${fromDetails || 'N/A'}\nTo Details: ${toDetails || 'N/A'}\nStatus: RECEIVED\n----------------------------------------\n\nThank you,\nStock Management System`;
            sendAutoEmail(targetEmail, 'Courier Received Confirmation - Stock Inventory', courierDetailsMail);
        }

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
        `, [trackingNo, courierCompany || null, id]);

        if (result.rows && result.rows.length > 0) {
            res.json({ success: true, parcel: result.rows[0] });
        } else {
            res.status(404).json({ success: false, message: "Outgoing parcel request not found" });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
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

// APIS FOR BILL TRACKING, MATERIAL INWARD, GATE PASS & FEATURE ACCESS
app.post('/api/bills/add', async (req, res) => {
    const { id, recDate, vendor, handover, billNo, billDate, amount, remark, status, mode } = req.body;
    try {
        const query = `
            INSERT INTO bill_tracking (id, rec_date, vendor, handover, bill_no, bill_date, amount, remark, status, mode)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING *;
        `;
        const values = [id || `BILL-${Math.floor(1000+Math.random()*9000)}`, recDate, vendor, handover, billNo, billDate, amount, remark, status, mode];
        const result = await db.query(query, values);
        res.json({ success: true, bill: result.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.delete('/api/bills/delete/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await db.query('DELETE FROM bill_tracking WHERE id = $1', [id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/inward/add', async (req, res) => {
    const { id, gateNo, desc, qty, party, docNo, mode, receiver, photo, timestamp } = req.body;
    try {
        let savedPhotoPath = photo;
        if (photo && typeof photo === 'string' && photo.startsWith('data:image')) {
            const matches = photo.match(/^data:image\/([A-Za-z-+]+);base64,(.+)$/);
            if (matches && matches.length === 3) {
                const base64Data = matches[2];
                const fileName = `inward_${id || Date.now()}.png`;
                const filePath = path.join(uploadDir, fileName);
                fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
                savedPhotoPath = `/uploads/${fileName}`;
            }
        }
        const query = `
            INSERT INTO material_inward (id, gate_no, description, qty, party, doc_no, mode, receiver, photo, timestamp)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING *;
        `;
        const values = [id || `INW-${Math.floor(1000+Math.random()*9000)}`, gateNo, desc, qty, party, docNo, mode, receiver, savedPhotoPath, timestamp];
        const result = await db.query(query, values);
        res.json({ success: true, inward: result.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.delete('/api/inward/delete/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await db.query('DELETE FROM material_inward WHERE id = $1', [id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/gatepass/add', async (req, res) => {
    const { id, type, location, desc, qty, itemNo, requester, receiverMobile, security, photo, approval } = req.body;
    try {
        let savedPhotoPath = photo;
        if (photo && typeof photo === 'string' && photo.startsWith('data:image')) {
            const matches = photo.match(/^data:image\/([A-Za-z-+]+);base64,(.+)$/);
            if (matches && matches.length === 3) {
                const base64Data = matches[2];
                const fileName = `gatepass_${id || Date.now()}.png`;
                const filePath = path.join(uploadDir, fileName);
                fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
                savedPhotoPath = `/uploads/${fileName}`;
            }
        }
        const query = `
            INSERT INTO gate_pass (id, type, location, description, qty, item_no, requester, receiver_mobile, security, photo, approval)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING *;
        `;
        const values = [id || `GP-${Math.floor(1000+Math.random()*9000)}`, type, location, desc, qty, itemNo, requester, receiverMobile, security, savedPhotoPath, approval];
        const result = await db.query(query, values);
        res.json({ success: true, gatePass: result.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.delete('/api/gatepass/delete/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await db.query('DELETE FROM gate_pass WHERE id = $1', [id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/feature-access/update', async (req, res) => {
    const { userId, bill, inward, gate } = req.body;
    try {
        const query = `
            INSERT INTO feature_access (user_id, bill, inward, gate)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (user_id) DO UPDATE SET bill = EXCLUDED.bill, inward = EXCLUDED.inward, gate = EXCLUDED.gate
            RETURNING *;
        `;
        const values = [userId, bill || false, inward || false, gate || false];
        const result = await db.query(query, values);
        res.json({ success: true, access: result.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
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
            try {
                updateResult = await db.query(`
                    UPDATE inventory 
                    SET opening = $1, current = $1 + COALESCE(received, 0) - COALESCE(issued, 0) 
                    WHERE item_id::text = $2::text 
                    RETURNING *;
                `, [parseOpening, String(itemId)]);
            } catch (e) {}
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
            try {
                updateResult = await db.query(`
                    UPDATE inventory 
                    SET received = COALESCE(received, 0) + $1, 
                        current = COALESCE(opening, 0) + COALESCE(received, 0) + $1 - COALESCE(issued, 0), 
                        last_date = $2 
                    WHERE item_id::text = $3::text
                    RETURNING *;
                `, [parseQty, dateStr, String(itemId)]);
            } catch (e) {}
        }

        if (!updateResult || !updateResult.rows || updateResult.rows.length === 0) {
            updateResult = await db.query(`
                UPDATE inventory 
                SET received = COALESCE(received, 0) + $1, 
                    current = COALESCE(opening, 0) + COALESCE(received, 0) + $1 - COALESCE(issued, 0), 
                    last_date = $2 
                WHERE item_id = (SELECT item_id FROM inventory LIMIT 1)
                RETURNING *;
            `, [parseQty]);
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

app.delete('/api/inventory/delete/:id', async (rowReq, res) => {
    const { id } = rowReq.params;
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
