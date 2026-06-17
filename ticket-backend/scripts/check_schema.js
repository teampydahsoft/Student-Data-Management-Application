require('dotenv').config();
const { sequelize } = require('../config/database');

async function test() {
    const [cols] = await sequelize.query(`DESCRIBE tickets`);
    console.log(cols);
    const [assignments] = await sequelize.query(`DESCRIBE ticket_assignments`);
    console.log(assignments);
    await sequelize.close();
}
test();
