const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: "postgresql://stock_management_yfj4_user:kWTCfmMwboWzrsyPlFxskU28DNZCs3Z1@dpg-db4uibp42hec73f2cs70-a.oregon-postgres.render.com/stock_management_yfj4",
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
