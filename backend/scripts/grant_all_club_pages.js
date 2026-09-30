const { masterPool } = require('../config/database');

const ALL_CLUB_PAGES = ['management', 'students', 'settings'];

const normalize = value => String(value ?? '').trim().toLowerCase();

const parseAssignments = (value, clubName) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) throw new Error('Expected an array');
    return parsed;
  } catch (error) {
    throw new Error(`Invalid admin_roles data for club ${clubName}: ${error.message}`);
  }
};

const main = async () => {
  const target = process.argv[2]?.trim();
  if (!target) throw new Error('Usage: node scripts/grant_all_club_pages.js <user-id-or-username>');

  const [users] = await masterPool.query(
    `SELECT id, name, email, username, hrms_id
     FROM rbac_users
     WHERE CAST(id AS CHAR) = ? OR username = ? OR CAST(hrms_id AS CHAR) = ?`,
    [target, target, target]
  );

  if (users.length !== 1) {
    throw new Error(`Expected one user matching "${target}", found ${users.length}. No changes made.`);
  }

  const user = users[0];
  const userKeys = new Set([
    `id_${normalize(user.id)}`,
    user.email && `email_${normalize(user.email)}`,
    user.username && `username_${normalize(user.username)}`,
    user.hrms_id && `hrms_${normalize(user.hrms_id)}`
  ].filter(Boolean));
  const connection = await masterPool.getConnection();

  try {
    await connection.beginTransaction();
    const [clubs] = await connection.query(
      'SELECT id, name, admin_roles FROM clubs WHERE is_active = 1 FOR UPDATE'
    );
    const updates = [];

    for (const club of clubs) {
      const assignments = parseAssignments(club.admin_roles, club.name);
      let changed = false;
      for (const assignment of assignments) {
        if (!assignment) continue;
        const assignmentKeys = [
          assignment.userId && `id_${normalize(assignment.userId)}`,
          assignment.email && `email_${normalize(assignment.email)}`,
          assignment.empNo && `username_${normalize(assignment.empNo)}`,
          assignment.hrmsId && `hrms_${normalize(assignment.hrmsId)}`
        ].filter(Boolean);
        if (assignmentKeys.some(key => userKeys.has(key))) {
          assignment.pages = [...ALL_CLUB_PAGES];
          changed = true;
        }
      }
      if (changed) updates.push({ id: club.id, name: club.name, assignments });
    }

    if (updates.length === 0) {
      throw new Error(`User ${user.id} (${user.name}) has no active club assignments. No changes made.`);
    }

    for (const club of updates) {
      await connection.query('UPDATE clubs SET admin_roles = ? WHERE id = ?', [
        JSON.stringify(club.assignments),
        club.id
      ]);
    }

    await connection.commit();
    console.log(`Granted all club pages to ${user.name} (user ${user.id}) in ${updates.length} assigned club(s):`);
    updates.forEach(club => console.log(`- ${club.name}`));
    console.log(`Pages: ${ALL_CLUB_PAGES.join(', ')}`);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

main()
  .catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => masterPool.end());
