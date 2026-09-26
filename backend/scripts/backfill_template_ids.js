const { masterPool } = require('../config/database');

async function backfillTemplateIds() {
  try {
    const [templates] = await masterPool.query('SELECT * FROM sms_templates');
    console.log(`Found ${templates.length} SMS templates to backfill.`);

    for (const t of templates) {
      // Find a clean static text snippet from template content
      const parts = t.content.split(/\{#var#\}|\{\{.*?\}\}/);
      const staticPart = parts.find(p => p.trim().length >= 8) || parts[0] || t.content;
      const cleanSnippet = staticPart.trim();

      if (cleanSnippet) {
        const [res] = await masterPool.query(
          `UPDATE sms_logs 
           SET template_id = ? 
           WHERE (template_id IS NULL OR template_id = '') 
           AND message LIKE ?`,
          [t.template_id, `%${cleanSnippet}%`]
        );
        console.log(`Backfilled template '${t.name}' (ID: ${t.template_id}): ${res.affectedRows} rows updated.`);
      }
    }

    console.log('✅ Backfill completed successfully.');
  } catch (error) {
    console.error('❌ Backfill error:', error);
  } finally {
    process.exit(0);
  }
}

backfillTemplateIds();
