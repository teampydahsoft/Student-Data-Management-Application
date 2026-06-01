const { normalizeDocument, toIsoDate } = require('../utils/mongoNormalize');

const invalid = new Date('invalid');
const cases = [
  { submitted_at: invalid },
  { submitted_at: { $date: 'not-a-date' } },
  { submitted_at: { $date: '2024-01-15T10:00:00.000Z' } },
  { submitted_at: new Date('2024-01-15') },
  { student: { dob: invalid, created_at: new Date('2020-01-01') } },
];

for (const c of cases) {
  try {
    const out = normalizeDocument(c);
    console.log('OK', JSON.stringify(out));
  } catch (e) {
    console.log('FAIL', e.message);
  }
}

console.log('toIsoDate invalid:', toIsoDate(invalid));
console.log('done');
