const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

pool.on('connect', () => {
    console.log('Successfully connected to PostgreSQL database!');
});

pool.on('error', (err) => {
    console.error('Unexpected PostgreSQL Error:', err.message);
});

module.exports = {
    query: (text, params) => pool.query(text, params),
};
