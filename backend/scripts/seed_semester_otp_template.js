require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { masterPool } = require('../config/database');

async function seedSemesterOtpTemplate() {
  try {
    const name = 'Semester Registration OTP';
    const templateId = '1707176605569953063';
    const content = 'Your {#var#} OTP for {#var#} Semester Registration is {#var#}. Valid for 5 minutes -Pydah College';
    const variableMappings = [
      { type: 'field', value: 'user_type' },
      { type: 'field', value: 'current_semester' },
      { type: 'static', value: 'OTP' }
    ];

    // Check if table exists
    await masterPool.query(`
      CREATE TABLE IF NOT EXISTS sms_templates (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        template_id VARCHAR(100) NOT NULL,
        content TEXT NOT NULL,
        variable_mappings JSON,
        created_by INT,
        created_by_name VARCHAR(255),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_template_id (template_id)
      )
    `);

    // Check if template exists
    const [existing] = await masterPool.query(
      'SELECT id FROM sms_templates WHERE template_id = ? OR name = ?',
      [templateId, name]
    );

    if (existing.length > 0) {
      await masterPool.query(
        `UPDATE sms_templates 
         SET name = ?, template_id = ?, content = ?, variable_mappings = ? 
         WHERE id = ?`,
        [name, templateId, content, JSON.stringify(variableMappings), existing[0].id]
      );
      console.log(`✅ Updated existing SMS template (ID: ${templateId}) in sms_templates table.`);
    } else {
      await masterPool.query(
        `INSERT INTO sms_templates (name, template_id, content, variable_mappings, created_by, created_by_name) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [name, templateId, content, JSON.stringify(variableMappings), 1, 'Super Admin']
      );
      console.log(`✅ Inserted new SMS template (ID: ${templateId}) into sms_templates table.`);
    }
  } catch (error) {
    console.error('❌ Error seeding SMS template:', error);
  } finally {
    process.exit(0);
  }
}

seedSemesterOtpTemplate();
