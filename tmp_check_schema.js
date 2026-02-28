
const mysql = require('mysql2');

async function checkSchema() {
    const config = {
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT || 3306,
        ssl: { rejectUnauthorized: false }
    };

    console.log('Connecting to:', config.host);

    try {
        const connection = await mysql.createConnection(config);
        const promiseConn = connection.promise();
        const [columns] = await promiseConn.query('DESCRIBE students');
        console.log('--- students table schema ---');
        columns.forEach(col => console.log(`${col.Field}: ${col.Type}`));
        await connection.end();
        process.exit(0);
    } catch (error) {
        console.error('Error checking schema:', error);
        process.exit(1);
    }
}

checkSchema();
