/**
 * Analyze date/time fields in AI-VERSANT crt database.
 * Run: node scripts/analyzeVersantDates.js
 */
require('dotenv').config();
const { MongoClient } = require('mongodb');

const DATE_FIELDS = [
  'submitted_at',
  'end_time',
  'start_time',
  'completed_at',
  'created_at',
  'updated_at',
  'timestamp',
];

async function typeBreakdown(collection, field) {
  return collection
    .aggregate([{ $group: { _id: { $type: `$${field}` }, count: { $sum: 1 } } }, { $sort: { count: -1 } }])
    .toArray();
}

function sampleValue(v) {
  if (v === null || v === undefined) return String(v);
  if (v instanceof Date) return `Date(${v.toISOString()})`;
  if (typeof v === 'object' && v.$date) return `$date:${JSON.stringify(v.$date)}`;
  return String(v).slice(0, 80);
}

(async () => {
  if (!process.env.MONGODB_URI) {
    console.error('Set MONGODB_URI in backend/.env');
    process.exit(1);
  }

  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db(process.env.MONGODB_DB_NAME || 'crt');

  console.log('=== AI-VERSANT Date Field Analysis (crt) ===\n');

  for (const collName of ['test_results', 'student_test_attempts']) {
    const coll = db.collection(collName);
    const total = await coll.estimatedDocumentCount();
    console.log(`\n--- ${collName} (${total} docs) ---`);

    for (const field of DATE_FIELDS) {
      const types = await typeBreakdown(coll, field);
      const nonMissing = types.filter((t) => t._id !== 'missing' && t.count > 0);
      if (!nonMissing.length) continue;
      console.log(`\n  ${field}:`);
      for (const t of nonMissing) {
        console.log(`    ${t._id}: ${t.count}`);
      }
    }

    const withSubmitted = await coll.countDocuments({ submitted_at: { $exists: true, $ne: null } });
    const withoutSubmitted = total - withSubmitted;
    console.log(`\n  submitted_at present: ${withSubmitted}, missing/null: ${withoutSubmitted}`);

    const samples = await coll.find({}).sort({ _id: -1 }).limit(8).toArray();
    console.log('\n  Recent samples (date fields):');
    for (const doc of samples) {
      const parts = DATE_FIELDS.map((f) => {
        const v = doc[f];
        if (v === undefined || v === null) return null;
        return `${f}=${sampleValue(v)}`;
      }).filter(Boolean);
      console.log(`    _id=${doc._id} | ${parts.join(' | ') || 'no date fields'}`);
    }

    const stringSamples = await coll
      .find({ submitted_at: { $type: 'string' } })
      .limit(5)
      .toArray();
    if (stringSamples.length) {
      console.log('\n  submitted_at as STRING examples:');
      stringSamples.forEach((d) => console.log(`    "${d.submitted_at}"`));
    }
  }

  const tr = db.collection('test_results');
  const attemptWithEnd = await db.collection('student_test_attempts').countDocuments({
    status: 'completed',
    submitted_at: { $in: [null, ''] },
    end_time: { $exists: true, $ne: null },
  });
  const trNoSub = await tr.countDocuments({
    $or: [{ submitted_at: null }, { submitted_at: { $exists: false } }],
  });
  console.log('\n--- Cross-collection ---');
  console.log(`  test_results without submitted_at: ${trNoSub}`);
  console.log(`  completed attempts with end_time but no submitted_at: ${attemptWithEnd}`);

  const testNameDateOnly = await tr
    .find({
      $or: [{ submitted_at: null }, { submitted_at: { $exists: false } }],
      test_id: { $exists: true },
    })
    .limit(3)
    .toArray();
  if (testNameDateOnly.length) {
    const tests = await db
      .collection('tests')
      .find({ _id: { $in: testNameDateOnly.map((d) => d.test_id) } })
      .toArray();
    const testMap = new Map(tests.map((t) => [t._id.toString(), t.name]));
    console.log('\n  test_results missing submitted_at — test names:');
    testNameDateOnly.forEach((d) => {
      console.log(`    ${testMap.get(d.test_id?.toString()) || d.test_id}`);
    });
  }

  await client.close();
  console.log('\nDone.');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
