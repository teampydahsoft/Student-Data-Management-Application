require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { masterPool } = require('../config/database');

(async () => {
  try {
    const [ocRows] = await masterPool.query(
      "SELECT id FROM caste_categories WHERE name = 'OC' LIMIT 1"
    );
    if (!ocRows.length) {
      console.error('OC category not found');
      process.exit(1);
    }

    const ocId = ocRows[0].id;

    const [before] = await masterPool.query(
      `SELECT c.id, c.name, cat.name AS category
       FROM castes c
       JOIN caste_categories cat ON cat.id = c.category_id
       WHERE LOWER(c.name) = 'kapu'`
    );
    console.log('Before:', before);

    const [result] = await masterPool.query(
      "UPDATE castes SET category_id = ? WHERE LOWER(name) = 'kapu'",
      [ocId]
    );
    console.log('Updated rows:', result.affectedRows);

    const [after] = await masterPool.query(
      `SELECT c.id, c.name, cat.name AS category
       FROM castes c
       JOIN caste_categories cat ON cat.id = c.category_id
       WHERE LOWER(c.name) = 'kapu'`
    );
    console.log('After:', after);
  } catch (error) {
    console.error(error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
})();
