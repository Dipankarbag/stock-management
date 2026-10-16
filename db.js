const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:bag@1991A@localhost:5432/stockflow_db',
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

module.exports = pool;    query: (text, params) => pool.query(text, params),
};

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

pool.on('connect', () => {
    console.log('Successfully connected to Local PostgreSQL database!');
});

pool.on('error', (err) => {
    console.error('Unexpected PostgreSQL Error:', err.message);
});

module.exports = {
    query: (text, params) => pool.query(text, params),
};
