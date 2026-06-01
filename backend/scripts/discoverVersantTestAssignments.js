/**
 * Discover how online tests are assigned to students in crt DB.
 * Run: node scripts/discoverVersantTestAssignments.js
 */
require('dotenv').config();
const { MongoClient, ObjectId } = require('mongodb');

(async () => {
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db(process.env.MONGODB_DB_NAME || 'crt');

  const collections = (await db.listCollections().toArray()).map((c) => c.name).sort();
  console.log('Collections:', collections.filter((n) => /test|assign|schedule|online/i.test(n)));

  for (const name of collections) {
    if (!/test|assign|schedule|online/i.test(name)) continue;
    const count = await db.collection(name).countDocuments();
    console.log(`\n=== ${name} (${count}) ===`);
    if (count === 0) continue;
    const sample = await db.collection(name).findOne({});
    console.log('keys:', Object.keys(sample || {}));
    console.log('sample:', JSON.stringify(sample, null, 2).slice(0, 2500));
  }

  const onlineTest = await db.collection('tests').findOne({ test_type: 'online' });
  const anyTest = onlineTest || (await db.collection('tests').findOne({}));
  if (anyTest) {
    console.log('\n=== tests sample (online or any) ===');
    console.log('keys:', Object.keys(anyTest));
    console.log(JSON.stringify(anyTest, null, 2).slice(0, 3500));
  }

  const student = await db.collection('students').findOne({ roll_number: { $exists: true } });
  if (student) {
    console.log('\n=== students sample keys ===');
    console.log(Object.keys(student));
    console.log({
      batch_id: student.batch_id,
      campus_id: student.campus_id,
      course_id: student.course_id,
      branch: student.branch,
    });
  }

  // Try batch-matched online tests for sample student
  if (student) {
    const batchMatch = {
      test_type: { $in: ['online', 'regular'] },
      $or: [
        { batch_id: student.batch_id },
        { batch_ids: student.batch_id },
        { assigned_batches: student.batch_id },
        { 'assigned_to.batch_id': student.batch_id },
      ].filter((q) => Object.values(q)[0] != null),
    };
    const matched = await db.collection('tests').find(batchMatch).limit(5).toArray();
    console.log('\n=== batch-matched tests for sample student ===', matched.length);
    matched.forEach((t) => console.log({ _id: t._id, name: t.name, test_type: t.test_type, status: t.status, start: t.start_date || t.start_time || t.scheduled_at }));
  }

  await client.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
