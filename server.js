
'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

const nowTime = () =>
  new Date().toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata'
  });

const today = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata'
  }).format(new Date());

const makeId = (prefix) =>
  `${prefix}-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

const isPositiveInt = (v) =>
  Number.isInteger(Number(v)) && Number(v) > 0;

const isNonNegativeInt = (v) =>
  Number.isInteger(Number(v)) && Number(v) >= 0;

function publicUser(row) {
  return {
    id: row.user_id,
    user_id: row.user_id,
    name: row.name,
    email: row.email,
    password: row.password,
    dept: row.dept,
    phone: row.phone,
    role: row.role,
    status: row.status
  };
}

// Open stock.html when the website is opened.
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'stock.html'));
});

// Check server and database connection.
app.get('/api/health', async (_req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({
      success: true,
      message: 'Server and PostgreSQL connected.'
    });
  } catch (err) {
    console.error('Health check failed:', err);
    res.status(500).json({
      success: false,
      message: 'Database connection failed.'
    });
  }
});

// Load application data.
app.get('/api/state', async (_req, res) => {
  try {
    const [users, inventory, orders, receivedLogs] =
      await Promise.all([
        db.query(
          `SELECT id, user_id, name, email, password, dept, phone, role, status
           FROM users ORDER BY id`
        ),
        db.query(
          `SELECT id, item_id, name, category, opening, received, issued, current, last_date
           FROM inventory ORDER BY id`
        ),
        db.query(
          `SELECT id, order_id, user_name, issuer_name, item_id, item_name,
           category, qty, time_str, date_only, status
           FROM orders ORDER BY id DESC`
        ),
        db.query(
          `SELECT id, item_id, receiver_name, qty, date_only, time_str
           FROM received_logs ORDER BY id DESC`
        )
      ]);

    res.json({
      users: users.rows.map(publicUser),
      inventory: inventory.rows,
      orders: orders.rows,
      receivedLogs: receivedLogs.rows,
      logs: []
    });
  } catch (err) {
    console.error('GET /api/state failed:', err);
    res.status(500).json({
      success: false,
      message: 'Could not load StockFlow data.'
    });
  }
});

// Login.
app.post('/api/auth/login', async (req, res) => {
  try {
    const username = String(
      req.body.username || req.body.email || ''
    ).trim().toLowerCase();

    const password = String(req.body.password || '');

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email/username and password are required.'
      });
    }

    const result = await db.query(
      `SELECT id, user_id, name, email, password, dept, phone, role, status
       FROM users
       WHERE LOWER(email) = $1 OR LOWER(name) = $1
       LIMIT 1`,
      [username]
    );

    const user = result.rows[0];

    if (!user || user.password !== password) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email/username or password.'
      });
    }

    if (user.status !== 'ACTIVE') {
      return res.status(403).json({
        success: false,
        message: 'This account is disabled.'
      });
    }

    res.json({
      success: true,
      user: publicUser(user)
    });
  } catch (err) {
    console.error('Login failed:', err);
    res.status(500).json({
      success: false,
      message: 'Login failed due to a server error.'
    });
  }
});

// Register a new user.
app.post('/api/auth/register', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const dept = String(req.body.dept || '').trim();
    const phone = String(req.body.phone || '').trim();
    const password = String(req.body.password || '');

    if (!name || !email || !dept || !phone || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please fill all registration fields.'
      });
    }

    if (password.length < 3) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 3 characters.'
      });
    }

    const userId = makeId('USR').slice(0, 20);

    const result = await db.query(
      `INSERT INTO users
       (user_id, name, email, password, dept, phone, role, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'USER', 'ACTIVE')
       RETURNING id, user_id, name, email, password, dept, phone, role, status`,
      [userId, name, email, password, dept, phone]
    );

    res.status(201).json({
      success: true,
      user: publicUser(result.rows[0])
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({
        success: false,
        message: 'Email or user ID already exists.'
      });
    }

    console.error('Registration failed:', err);
    res.status(500).json({
      success: false,
      message: 'Registration failed.'
    });
  }
});

// Add inventory item.
app.post('/api/inventory/add', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const category = String(req.body.category || '').trim();
    const opening =
      req.body.opening === undefined ? 0 : Number(req.body.opening);

    if (!name || !category || !isNonNegativeInt(opening)) {
      return res.status(400).json({
        success: false,
        message: 'Valid item name, category and opening stock are required.'
      });
    }

    const itemId = String(
      req.body.itemId || makeId('ITEM')
    ).trim().slice(0, 50);

    const result = await db.query(
      `INSERT INTO inventory
       (item_id, name, category, opening, received, issued, current, last_date)
       VALUES ($1, $2, $3, $4, 0, 0, $4, CURRENT_DATE)
       RETURNING *`,
      [itemId, name, category, opening]
    );

    res.status(201).json({
      success: true,
      item: result.rows[0]
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({
        success: false,
        message: 'Item ID already exists.'
      });
    }

    console.error('Add inventory failed:', err);
    res.status(500).json({
      success: false,
      message: 'Could not add inventory item.'
    });
  }
});

// Receive stock.
app.post('/api/inventory/stock-in', async (req, res) => {
  let client;

  try {
    client = await db.connect();

    const itemId = String(
      req.body.itemId || req.body.id || ''
    ).trim();

    const qty = Number(req.body.qty ?? req.body.quantity);

    const dateStr = String(
      req.body.dateStr || req.body.date || today()
    ).trim();

    const receiver = String(
      req.body.receiver || req.body.receiverName || ''
    ).trim();

    if (
      !itemId ||
      !isPositiveInt(qty) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(dateStr) ||
      !receiver
    ) {
      return res.status(400).json({
        success: false,
        message: 'Item, positive quantity, valid date and receiver name are required.'
      });
    }

    await client.query('BEGIN');

    const updated = await client.query(
      `UPDATE inventory
       SET received = received + $1,
           current = current + $1,
           last_date = $2::date
       WHERE item_id = $3
       RETURNING *`,
      [qty, dateStr, itemId]
    );

    if (!updated.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Inventory item not found.'
      });
    }

    const log = await client.query(
      `INSERT INTO received_logs
       (item_id, receiver_name, qty, date_only, time_str)
       VALUES ($1, $2, $3, $4::date, $5)
       RETURNING *`,
      [itemId, receiver, qty, dateStr, nowTime()]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      item: updated.rows[0],
      receivedLog: log.rows[0]
    });
  } catch (err) {
    if (client) {
      await client.query('ROLLBACK').catch(() => {});
    }

    console.error('Stock-in failed:', err);
    res.status(500).json({
      success: false,
      message: 'Could not record received stock.'
    });
  } finally {
    if (client) client.release();
  }
});

// Update opening stock.
app.post('/api/inventory/update-opening', async (req, res) => {
  try {
    const itemId = String(
      req.body.itemId || req.body.id || ''
    ).trim();

    const opening = Number(
      req.body.newOpening ?? req.body.opening ?? req.body.quantity
    );

    if (!itemId || !isNonNegativeInt(opening)) {
      return res.status(400).json({
        success: false,
        message: 'Valid item ID and opening stock are required.'
      });
    }

    const result = await db.query(
      `UPDATE inventory
       SET opening = $1,
           current = $1 + received - issued
       WHERE item_id = $2
       RETURNING *`,
      [opening, itemId]
    );

    if (!result.rowCount) {
      return res.status(404).json({
        success: false,
        message: 'Inventory item not found.'
      });
    }

    res.json({
      success: true,
      item: result.rows[0]
    });
  } catch (err) {
    console.error('Update opening stock failed:', err);
    res.status(500).json({
      success: false,
      message: 'Could not update opening stock.'
    });
  }
});

// Create order.
app.post('/api/orders/create', async (req, res) => {
  try {
    const userName = String(
      req.body.userName || req.body.user || ''
    ).trim();

    const itemId = String(req.body.itemId || '').trim();
    const qty = Number(req.body.qty);

    if (!userName || !itemId || !isPositiveInt(qty)) {
      return res.status(400).json({
        success: false,
        message: 'User name, item ID and positive quantity are required.'
      });
    }

    const itemResult = await db.query(
      'SELECT * FROM inventory WHERE item_id = $1',
      [itemId]
    );

    const item = itemResult.rows[0];

    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Inventory item not found.'
      });
    }

    if (qty > item.current) {
      return res.status(409).json({
        success: false,
        message: 'Insufficient stock available.'
      });
    }

    const orderId = makeId('ORD');

    const result = await db.query(
      `INSERT INTO orders
       (order_id, user_name, issuer_name, item_id, item_name,
        category, qty, time_str, date_only, status)
       VALUES ($1, $2, 'N/A', $3, $4, $5, $6, $7, $8::date, 'UNDER PROCESS')
       RETURNING *`,
      [
        orderId,
        userName,
        item.item_id,
        item.name,
        item.category,
        qty,
        `${today()} ${nowTime()}`,
        today()
      ]
    );

    res.status(201).json({
      success: true,
      order: result.rows[0]
    });
  } catch (err) {
    console.error('Create order failed:', err);
    res.status(500).json({
      success: false,
      message: 'Could not submit requisition order.'
    });
  }
});

// Approve, issue or reject order.
app.post('/api/orders/process', async (req, res) => {
  let client;

  try {
    client = await db.connect();

    const orderId = String(req.body.orderId || '').trim();
    const action = String(req.body.action || '').trim().toUpperCase();
    const issuerName = String(
      req.body.issuerName || 'System Admin'
    ).trim();

    if (
      !orderId ||
      !['APPROVE', 'ISSUE', 'REJECT'].includes(action)
    ) {
      return res.status(400).json({
        success: false,
        message: 'Valid order ID and action are required.'
      });
    }

    await client.query('BEGIN');

    const orderResult = await client.query(
      'SELECT * FROM orders WHERE order_id = $1 FOR UPDATE',
      [orderId]
    );

    const order = orderResult.rows[0];

    if (!order) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Order not found.'
      });
    }

    if (['ISSUED', 'REJECTED'].includes(order.status)) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: `Order is already ${order.status}.`
      });
    }

    let updatedOrder;

    if (action === 'APPROVE') {
      const result = await client.query(
        `UPDATE orders
         SET status = 'APPROVED', issuer_name = $1
         WHERE order_id = $2
         RETURNING *`,
        [issuerName, orderId]
      );

      updatedOrder = result.rows[0];
    } else if (action === 'REJECT') {
      const result = await client.query(
        `UPDATE orders
         SET status = 'REJECTED', issuer_name = $1
         WHERE order_id = $2
         RETURNING *`,
        [issuerName, orderId]
      );

      updatedOrder = result.rows[0];
    } else {
      const stockResult = await client.query(
        'SELECT * FROM inventory WHERE item_id = $1 FOR UPDATE',
        [order.item_id]
      );

      const stock = stockResult.rows[0];

      if (!stock || stock.current < order.qty) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          message: 'Insufficient stock to issue this order.'
        });
      }

      await client.query(
        `UPDATE inventory
         SET issued = issued + $1,
             current = current - $1
         WHERE item_id = $2`,
        [order.qty, order.item_id]
      );

      const result = await client.query(
        `UPDATE orders
         SET status = 'ISSUED', issuer_name = $1
         WHERE order_id = $2
         RETURNING *`,
        [issuerName, orderId]
      );

      updatedOrder = result.rows[0];
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      order: updatedOrder
    });
  } catch (err) {
    if (client) {
      await client.query('ROLLBACK').catch(() => {});
    }

    console.error('Process order failed:', err);
    res.status(500).json({
      success: false,
      message: 'Could not process order.'
    });
  } finally {
    if (client) client.release();
  }
});

// Enable or disable a user.
app.patch('/api/users/:userId/status', async (req, res) => {
  try {
    const status = String(req.body.status || '').toUpperCase();

    if (!['ACTIVE', 'DISABLED'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Status must be ACTIVE or DISABLED.'
      });
    }

    const result = await db.query(
      `UPDATE users
       SET status = $1
       WHERE user_id = $2 AND role <> 'ADMIN'
       RETURNING id, user_id, name, email, dept, phone, role, status`,
      [status, req.params.userId]
    );

    if (!result.rowCount) {
      return res.status(404).json({
        success: false,
        message: 'User not found or admin status cannot be changed here.'
      });
    }

    res.json({
      success: true,
      user: result.rows[0]
    });
  } catch (err) {
    console.error('Update user status failed:', err);
    res.status(500).json({
      success: false,
      message: 'Could not update user status.'
    });
  }
});

// Delete a user.
app.delete('/api/users/:userId', async (req, res) => {
  try {
    const result = await db.query(
      `DELETE FROM users
       WHERE user_id = $1 AND role <> 'ADMIN'
       RETURNING user_id`,
      [req.params.userId]
    );

    if (!result.rowCount) {
      return res.status(404).json({
        success: false,
        message: 'User not found or admin account cannot be deleted here.'
      });
    }

    res.json({
      success: true,
      userId: result.rows[0].user_id
    });
  } catch (err) {
    console.error('Delete user failed:', err);
    res.status(500).json({
      success: false,
      message: 'Could not delete user.'
    });
  }
});

// Handle unexpected errors.
app.use((err, _req, res, _next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({
    success: false,
    message: 'Unexpected server error.'
  });
});

app.listen(PORT, () => {
  console.log(`StockFlow server running on port ${PORT}`);
});
