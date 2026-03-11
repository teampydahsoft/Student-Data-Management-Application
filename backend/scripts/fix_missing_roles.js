const { masterPool } = require('../config/database');
require('dotenv').config();

async function fixMissingRoles() {
  try {
    console.log('--- Checking for users with missing roles ---');
    const [users] = await masterPool.query('SELECT id, name, email, role, permissions FROM rbac_users WHERE role IS NULL OR role = ""');
    
    if (users.length === 0) {
      console.log('No users with missing roles found.');
      return;
    }

    console.log(`Found ${users.length} users with missing roles.`);

    for (const user of users) {
      let suggestedRole = 'support_staff'; // Default for maintenance/ticket users
      
      // Check permissions for clues
      let perms = {};
      try {
        perms = typeof user.permissions === 'string' ? JSON.parse(user.permissions) : user.permissions;
      } catch (e) {
        console.warn(`Could not parse permissions for user ${user.id}`);
      }

      // If they have ticket-related permissions but no role, they are likely support_staff
      const hasTicketPerms = Object.keys(perms || {}).some(k => k.startsWith('ticket_'));
      
      if (hasTicketPerms) {
        suggestedRole = 'support_staff';
      } else {
        // Fallback or manual intervention
        console.log(`User ${user.id} (${user.name}) has no obvious ticket perms. Assigning 'support_staff' as fallback.`);
        suggestedRole = 'support_staff';
      }

      console.log(`Updating User ${user.id} (${user.name}) -> Role: ${suggestedRole}`);
      
      await masterPool.query('UPDATE rbac_users SET role = ? WHERE id = ?', [suggestedRole, user.id]);
    }

    console.log('--- Repair completed successfully ---');
  } catch (err) {
    console.error('Error during repair:', err);
  } finally {
    process.exit();
  }
}

fixMissingRoles();
