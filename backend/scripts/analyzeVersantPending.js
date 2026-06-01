require('dotenv').config();
const { MongoClient } = require('mongodb');

(async () => {
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db(process.env.MONGODB_DB_NAME || 'crt');

  const statuses = await db
    .collection('student_test_attempts')
    .aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }, { $sort: { count: -1 } }])
    .toArray();
  console.log('attempt statuses:', statuses);

  const assignCount = await db.collection('student_test_assignments').countDocuments();
  console.log('assignments count:', assignCount);

  if (assignCount > 0) {
    const aStatuses = await db
      .collection('student_test_assignments')
      .aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }])
      .toArray();
    console.log('assignment statuses:', aStatuses);
    const sample = await db.collection('student_test_assignments').findOne({});
    console.log('assignment sample keys:', sample ? Object.keys(sample) : null);
  }

  const pendingSample = await db.collection('student_test_attempts').findOne({
    status: { $nin: ['completed', 'complete', 'submitted', 'finished', 'done'] },
  });
  console.log(
    'non-completed attempt sample:',
    pendingSample
      ? { status: pendingSample.status, keys: Object.keys(pendingSample) }
      : null,
  );

  await client.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
