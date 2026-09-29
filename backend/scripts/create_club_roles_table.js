const { masterPool } = require('../config/database');

const createClubRolesTable = async () => {
  try {
    console.log('Setting up Student Club Roles table and schema modifications...');

    // 1. Create club_roles table
    await masterPool.query(`
      CREATE TABLE IF NOT EXISTS club_roles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        role_name VARCHAR(100) NOT NULL,
        role_code VARCHAR(50) NOT NULL UNIQUE,
        description TEXT,
        is_system BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    console.log('✓ club_roles table created/verified.');

    // 2. Add admin_roles column to clubs table if missing
    const [cols] = await masterPool.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'clubs' 
        AND COLUMN_NAME = 'admin_roles';
    `);

    if (cols.length === 0) {
      await masterPool.query(`
        ALTER TABLE clubs ADD COLUMN admin_roles JSON DEFAULT NULL;
      `);
      console.log('✓ Added admin_roles column to clubs table.');
    } else {
      console.log('✓ admin_roles column already exists in clubs table.');
    }

    // 3. Seed default dynamic roles if empty
    const [roles] = await masterPool.query('SELECT COUNT(*) as count FROM club_roles');
    if (roles[0].count === 0) {
      const defaultRoles = [
        ['President', 'president', 'Club President - Head of operations and club activities', true],
        ['Vice President', 'vice_president', 'Assists President in managing club operations', true],
        ['Secretary', 'secretary', 'Maintains club records, schedules, and correspondence', true],
        ['Treasurer', 'treasurer', 'Manages club finances and budget tracking', true],
        ['Faculty Coordinator', 'faculty_coordinator', 'Faculty advisor overseeing club activities', true],
        ['Event Lead', 'event_lead', 'Organizes and coordinates club events & activities', true],
        ['Club Member', 'club_member', 'Standard registered club member', true]
      ];

      for (const [role_name, role_code, description, is_system] of defaultRoles) {
        await masterPool.query(
          'INSERT INTO club_roles (role_name, role_code, description, is_system) VALUES (?, ?, ?, ?)',
          [role_name, role_code, description, is_system]
        );
      }
      console.log('✓ Default dynamic club roles seeded successfully.');
    } else {
      console.log('✓ Dynamic club roles already present.');
    }

    console.log('✓ Student Club schema initialization complete!');
    process.exit(0);
  } catch (error) {
    console.error('Failed to initialize club roles schema:', error);
    process.exit(1);
  }
};

createClubRolesTable();
