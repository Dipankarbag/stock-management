const { Pool } = require('pg');

const pool = new Pool({
    // Direct apna Render PostgreSQL connection string yahan double quotes mein paste karein
    connectionString: "postgres://username:password@hostname/dbname",
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
