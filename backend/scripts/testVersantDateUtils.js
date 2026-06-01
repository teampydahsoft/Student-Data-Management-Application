const {
  resolveVersantSubmittedAt,
  parseDateFromTestName,
  formatSubmittedAtDisplay,
} = require('../utils/versantDateUtils');

const cases = [
  { submitted_at: new Date('2026-02-18T10:30:00Z') },
  { submitted_at: '2026-02-18T10:30:00.000Z' },
  { submitted_at: '18-02-2026 14:30:00' },
  { submitted_at: '18-2-2026' },
  { end_time: new Date('2026-01-30T08:00:00Z'), submitted_at: null },
  { test_name: '4th B.Tech SoftSkills (Verbs) 18-2-2026' },
  { test_name: 'CRT Technical 30-1-2026', submitted_at: null },
  { submitted_at: { $date: '2026-02-18T05:00:00.000Z' } },
  { submitted_at: 1739872800000 },
];

let pass = 0;
for (const c of cases) {
  const iso = resolveVersantSubmittedAt(c);
  const disp = formatSubmittedAtDisplay(iso);
  console.log(JSON.stringify(c).slice(0, 60), '=>', iso ? disp.formatted : 'null');
  if (iso) pass++;
}
console.log(`\n${pass}/${cases.length} resolved`);
process.exit(pass === cases.length ? 0 : 1);
