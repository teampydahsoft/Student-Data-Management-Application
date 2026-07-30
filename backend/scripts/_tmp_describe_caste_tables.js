require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { masterPool } = require('../config/database');

(async () => {
  try {
    const [tables] = await masterPool.query(
      `SELECT TABLE_NAME, TABLE_ROWS, TABLE_COMMENT
       FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME IN ('caste_categories', 'castes', 'students')
       ORDER BY TABLE_NAME`
    );

    console.log('=== Relevant tables ===');
    for (const t of tables) {
      console.log(`${t.TABLE_NAME} (approx rows: ${t.TABLE_ROWS})`);
    }

    for (const name of ['caste_categories', 'castes']) {
      const [cols] = await masterPool.query(
        `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY, COLUMN_DEFAULT, EXTRA
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
         ORDER BY ORDINAL_POSITION`,
        [name]
      );
      console.log(`\n=== ${name} columns ===`);
      cols.forEach((c) => {
        console.log(
          `  ${c.COLUMN_NAME} | ${c.COLUMN_TYPE} | null=${c.IS_NULLABLE} | key=${c.COLUMN_KEY || '-'} | default=${c.COLUMN_DEFAULT}`
        );
      });
    }

    const [studentCols] = await masterPool.query(
      `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'students'
         AND COLUMN_NAME IN ('caste', 'caste_id')
       ORDER BY ORDINAL_POSITION`
    );
    console.log('\n=== students caste-related columns ===');
    studentCols.forEach((c) => {
      console.log(`  ${c.COLUMN_NAME} | ${c.COLUMN_TYPE} | null=${c.IS_NULLABLE}`);
    });

    const [[{ categories }]] = await masterPool.query(
      'SELECT COUNT(*) AS categories FROM caste_categories'
    );
    const [[{ castes }]] = await masterPool.query('SELECT COUNT(*) AS castes FROM castes');
    const [[{ withCaste }]] = await masterPool.query(
      `SELECT COUNT(*) AS withCaste FROM students WHERE caste IS NOT NULL AND TRIM(caste) <> ''`
    );
    const [[{ withCasteId }]] = await masterPool.query(
      `SELECT COUNT(*) AS withCasteId FROM students WHERE caste_id IS NOT NULL`
    );

    console.log('\n=== Current counts ===');
    console.log(`caste_categories: ${categories}`);
    console.log(`castes (nested): ${castes}`);
    console.log(`students with caste text: ${withCaste}`);
    console.log(`students with caste_id: ${withCasteId}`);

    const [cats] = await masterPool.query(
      `SELECT cat.id, cat.name,
              (SELECT COUNT(*) FROM castes c WHERE c.category_id = cat.id) AS nested_count
       FROM caste_categories cat
       ORDER BY cat.sort_order ASC, cat.name ASC`
    );
    console.log('\n=== Categories in DB ===');
    cats.forEach((r) => console.log(`  ${r.id}: ${r.name} (nested castes: ${r.nested_count})`));
  } catch (e) {
    console.error(e.message || e);
    process.exitCode = 1;
  } finally {
    await masterPool.end();
  }
})();
