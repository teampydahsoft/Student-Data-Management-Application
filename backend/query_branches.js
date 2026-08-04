const { masterPool } = require('./config/database');

async function queryBranches() {
  try {
    console.log("--- Querying Colleges ---");
    const [colleges] = await masterPool.execute("SELECT * FROM colleges");
    console.log(colleges);

    console.log("\n--- Querying Diploma Branches ---");
    const [branches] = await masterPool.execute(`
      SELECT cb.name as branch_name, c.name as course_name, col.name as college_name 
      FROM course_branches cb
      JOIN courses c ON cb.course_id = c.id
      LEFT JOIN colleges col ON c.college_id = col.id
      WHERE col.name LIKE '%pydah%' OR c.name LIKE '%diploma%'
    `);
    console.log(branches);

    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}
queryBranches();
