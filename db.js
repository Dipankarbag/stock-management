const { Pool } = require('pg');

// এনভায়রনমেন্ট ভ্যারিয়েবল ব্যবহার করে PostgreSQL কানেকশন পুল তৈরি করা
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    // রেন্ডার বা ক্লাউড ডাটাবেজের ক্ষেত্রে SSL কানেকশন প্রয়োজন হতে পারে, লোকালহোস্টের জন্য বন্ধ থাকবে
    ssl: process.env.DB_HOST && process.env.DB_HOST !== 'localhost' ? { rejectUnauthorized: false } : false
});

// ডাটাবেজ কানেকশন সফল হয়েছে কিনা তা চেক করার জন্য
pool.connect((err, client, release) => {
    if (err) {
        console.error('Database connection error:', err.stack);
    } else {
        console.log('Database connected successfully!');
        release();
    }
});

module.exports = pool;
