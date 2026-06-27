require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const bcrypt = require('bcryptjs');
const { masterPool } = require('../config/database');

async function debugStudentLogin() {
  const username = process.argv[2] || '25AG13';
  const password = process.argv[3] || '47w8VJuF';

  const [creds] = await masterPool.query(
    `SELECT sc.id, sc.student_id, sc.admission_number, sc.username, sc.password_hash, sc.updated_at,
            s.pin_no, s.admission_no, s.student_name
     FROM student_credentials sc
     JOIN students s ON s.id = sc.student_id
     WHERE sc.username = ? OR sc.admission_number = ? OR s.admission_number = ? OR s.admission_no = ? OR s.pin_no = ?`,
    [username, username, username, username, username]
  );

  console.log(`Username tested: ${username}`);
  console.log(`Password tested: ${password}`);
  console.log(`Matches found: ${creds.length}`);

  for (const c of creds) {
    const match = c.password_hash ? await bcrypt.compare(password, c.password_hash) : false;
    console.log({
      id: c.id,
      student_id: c.student_id,
      username: c.username,
      admission_number: c.admission_number,
      pin_no: c.pin_no,
      name: c.student_name,
      updated_at: c.updated_at,
      passwordMatch: match
    });
  }

  const [rbac] = await masterPool.query('SELECT id, username FROM rbac_users WHERE username = ? LIMIT 1', [username]);
  const [admins] = await masterPool.query('SELECT id, username FROM admins WHERE username = ? LIMIT 1', [username]);
  console.log('RBAC match:', rbac.length);
  console.log('Admin match:', admins.length);

  process.exit(0);
}

debugStudentLogin().catch((error) => {
  console.error(error);
  process.exit(1);
});
