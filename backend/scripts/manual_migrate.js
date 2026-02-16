require('dotenv').config({ path: 'backend/.env' }); // Load env vars
const { runMigrations } = require('./runMigrations');
runMigrations()
    .then(() => {
        console.log('Manual migration complete');
        process.exit(0);
    })
    .catch(err => {
        console.error('Migration failed', err);
        process.exit(1);
    });
