/**
 * Import nested castes from CASTES.xlsx into castes table under matching categories.
 *
 * Header mapping:
 *   Category - SC     → SC
 *   Category - ST     → ST
 *   Category - BC A   → BC-A
 *   Category - BC B   → BC-B
 *   Category - BC D   → BC-D
 *   Category -BC C    → BC-C
 *   Category -BC-E    → BC-E
 *   EBC-OC            → OC
 *
 * Usage:
 *   node backend/scripts/import_castes_from_xlsx.js
 *   node backend/scripts/import_castes_from_xlsx.js --report-only
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const path = require('path');
const { spawnSync } = require('child_process');
const { masterPool } = require('../config/database');

const reportOnly = process.argv.includes('--report-only');
const xlsxPath = path.join(__dirname, '../../CASTES.xlsx');

const HEADER_TO_CATEGORY = {
  'Category - SC': 'SC',
  'Category - ST': 'ST',
  'Category - BC A': 'BC-A',
  'Category - BC B': 'BC-B',
  'Category - BC D': 'BC-D',
  'EBC-OC': 'EBC-OC',
  'Category -BC C': 'BC-C',
  'Category -BC-E': 'BC-E'
};

function loadRowsFromExcel() {
  const py = `
import json, openpyxl
wb = openpyxl.load_workbook(r'''${xlsxPath.replace(/\\/g, '\\\\')}''')
ws = wb.active
headers = [c.value for c in next(ws.iter_rows(min_row=1, max_row=1))]
out = {}
for row in ws.iter_rows(min_row=2, values_only=True):
    for i, h in enumerate(headers):
        if not h:
            continue
        v = row[i] if i < len(row) else None
        if v is None:
            continue
        name = str(v).strip()
        if not name:
            continue
        out.setdefault(str(h).strip(), [])
        key = name.lower()
        if not any(x.lower() == key for x in out[str(h).strip()]):
            out[str(h).strip()].append(name)
print(json.dumps(out, ensure_ascii=False))
`;
  const result = spawnSync('python', ['-c', py], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'Failed to read Excel');
  }
  return JSON.parse(result.stdout.trim());
}

(async () => {
  try {
    const excelData = loadRowsFromExcel();

    console.log('--- Excel columns → Settings categories ---');
    for (const [header, names] of Object.entries(excelData)) {
      const mapped = HEADER_TO_CATEGORY[header] || '(UNMAPPED)';
      console.log(`  "${header}" → ${mapped} (${names.length} castes)`);
    }

    const unmapped = Object.keys(excelData).filter((h) => !HEADER_TO_CATEGORY[h]);
    if (unmapped.length) {
      console.error('Unmapped headers:', unmapped.join(', '));
      process.exit(1);
    }

    // Ensure categories exist
    const [existingCats] = await masterPool.query(
      'SELECT id, name FROM caste_categories'
    );
    const catByName = new Map(
      existingCats.map((r) => [String(r.name).trim().toLowerCase(), r])
    );

    let createdCategories = 0;
    for (const categoryName of [...new Set(Object.values(HEADER_TO_CATEGORY))]) {
      const key = categoryName.toLowerCase();
      if (!catByName.has(key)) {
        if (reportOnly) {
          console.log(`[report] would create category: ${categoryName}`);
          continue;
        }
        const [ins] = await masterPool.query(
          `INSERT INTO caste_categories (name, is_active, sort_order) VALUES (?, 1, ?)`,
          [categoryName, createdCategories + 1]
        );
        catByName.set(key, { id: ins.insertId, name: categoryName });
        createdCategories += 1;
        console.log(`Created category: ${categoryName}`);
      }
    }

    let inserted = 0;
    let skipped = 0;
    const byCategory = {};

    for (const [header, names] of Object.entries(excelData)) {
      const categoryName = HEADER_TO_CATEGORY[header];
      const cat = catByName.get(categoryName.toLowerCase());
      if (!cat) {
        console.warn(`Skip ${header}: category ${categoryName} missing`);
        continue;
      }

      const [existingCastes] = await masterPool.query(
        `SELECT name FROM castes WHERE category_id = ?`,
        [cat.id]
      );
      const existingSet = new Set(
        existingCastes.map((r) => String(r.name).trim().toLowerCase())
      );

      let sortOrder = existingCastes.length;
      byCategory[categoryName] = { added: 0, skipped: 0, total: names.length };

      for (const name of names) {
        const key = name.toLowerCase();
        if (existingSet.has(key)) {
          skipped += 1;
          byCategory[categoryName].skipped += 1;
          continue;
        }
        if (reportOnly) {
          inserted += 1;
          byCategory[categoryName].added += 1;
          continue;
        }
        sortOrder += 1;
        await masterPool.query(
          `INSERT INTO castes (category_id, name, is_active, sort_order)
           VALUES (?, ?, 1, ?)`,
          [cat.id, name, sortOrder]
        );
        existingSet.add(key);
        inserted += 1;
        byCategory[categoryName].added += 1;
      }
    }

    console.log('\n--- Per category ---');
    Object.entries(byCategory).forEach(([cat, stats]) => {
      console.log(
        `  ${cat}: excel=${stats.total}, added=${stats.added}, skipped(existing)=${stats.skipped}`
      );
    });
    console.log(
      `\n${reportOnly ? '(report-only) would add' : 'Added'} ${inserted} caste(s); skipped ${skipped} existing.`
    );

    if (!reportOnly) {
      const [counts] = await masterPool.query(
        `SELECT cat.name, COUNT(c.id) AS caste_count
         FROM caste_categories cat
         LEFT JOIN castes c ON c.category_id = cat.id
         GROUP BY cat.id, cat.name
         ORDER BY cat.name`
      );
      console.log('\n--- DB after import ---');
      counts.forEach((r) => console.log(`  ${r.name}: ${r.caste_count} castes`));
    }

    process.exit(0);
  } catch (error) {
    console.error('Import failed:', error.message || error);
    process.exit(1);
  } finally {
    try {
      await masterPool.end();
    } catch (_) {
      /* ignore */
    }
  }
})();
