const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:bag@1991A@localhost:5432/stockflow_db',
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

module.exports = pool;
