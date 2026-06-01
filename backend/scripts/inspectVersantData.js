require('dotenv').config();
const { MongoClient } = require('mongodb');

function walkDates(obj, path, issues) {
  if (obj === null || obj === undefined) return;
  if (obj instanceof Date) {
    if (Number.isNaN(obj.getTime())) issues.push({ path, kind: 'Invalid Date instance' });
    return;
  }
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => walkDates(v, `${path}[${i}]`, issues));
    return;
  }
  if (typeof obj === 'object' && !(obj.constructor && obj.constructor.name === 'ObjectId')) {
    if (Object.prototype.hasOwnProperty.call(obj, '$date')) {
      const d = obj.$date;
      const parsed = typeof d === 'string' ? new Date(d) : new Date(d);
      if (Number.isNaN(parsed.getTime())) {
        issues.push({ path, kind: '$date', raw: d });
      }
    }
    for (const [k, v] of Object.entries(obj)) {
      if (k === '$date') continue;
      walkDates(v, `${path}.${k}`, issues);
    }
  }
}

(async () => {
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db(process.env.MONGODB_DB_NAME || 'crt');

  const types = await db
    .collection('test_results')
    .aggregate([{ $group: { _id: { $type: '$submitted_at' }, count: { $sum: 1 } } }])
    .toArray();

  console.log('test_results.submitted_at BSON types:', types);

  const joined = await db
    .collection('test_results')
    .aggregate(
      [
        { $unset: 'results' },
        { $limit: 300 },
        {
          $lookup: {
            from: 'users',
            localField: 'student_id',
            foreignField: '_id',
            as: 'user',
          },
        },
        {
          $lookup: {
            from: 'students',
            localField: 'student_id',
            foreignField: 'user_id',
            as: 'student',
          },
        },
        { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
        { $unwind: { path: '$student', preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: 'tests',
            localField: 'test_id',
            foreignField: '_id',
            as: 'test',
          },
        },
        { $unwind: { path: '$test', preserveNullAndEmptyArrays: true } },
      ],
      { allowDiskUse: true },
    )
    .toArray();

  const issues = [];
  for (const row of joined) walkDates(row, 'root', issues);
  console.log('Invalid dates in 300 joined rows:', issues.length);
  console.log(issues.slice(0, 10));

  const sample = joined[0];
  if (sample) {
    console.log('\nSample doc field types:');
    for (const key of [
      'submitted_at',
      'student_id',
      'test_id',
      'created_at',
      'updated_at',
    ]) {
      const v = sample[key];
      console.log(`  ${key}:`, v, v?.constructor?.name);
    }
    if (sample.student) {
      console.log('  student.created_at:', sample.student.created_at, sample.student.created_at?.constructor?.name);
      console.log('  student.dob:', sample.student.dob, sample.student.dob?.constructor?.name);
    }
    if (sample.user) {
      console.log('  user keys with dates:', Object.keys(sample.user).filter((k) => /date|at|time/i.test(k)));
      for (const k of Object.keys(sample.user)) {
        if (sample.user[k] instanceof Date) console.log(`    user.${k}:`, sample.user[k]);
      }
    }
    if (sample.test) {
      for (const k of Object.keys(sample.test)) {
        if (sample.test[k] instanceof Date) console.log(`    test.${k}:`, sample.test[k], isNaN(sample.test[k].getTime()));
      }
    }
  }

  await client.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
