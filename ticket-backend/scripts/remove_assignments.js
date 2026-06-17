require('dotenv').config();
const { sequelize } = require('../config/database');

async function removeAssignments() {
    try {
        const ticketNumber = 'TKT-2026-352800-521';
        console.log(`Connecting to database to remove assignments for ${ticketNumber}...`);
        
        // Find the internal ticket ID
        const [tickets] = await sequelize.query(`SELECT id FROM tickets WHERE ticket_number = ?`, {
            replacements: [ticketNumber]
        });
        
        if (tickets.length === 0) {
            console.log(`Ticket ${ticketNumber} not found.`);
            process.exit(0);
        }
        
        const internalId = tickets[0].id;
        console.log(`Found ticket internal ID: ${internalId}`);
        
        // Delete assignments
        const [result] = await sequelize.query(`DELETE FROM ticket_assignments WHERE ticket_id = ?`, {
            replacements: [internalId]
        });
        
        console.log('Successfully deleted assignments.');
        
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await sequelize.close();
    }
}

removeAssignments();
