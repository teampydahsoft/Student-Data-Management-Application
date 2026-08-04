const fs = require('fs');
const path = require('path');

function findFilesWithQuery(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(findFilesWithQuery(fullPath));
    } else if (file.endsWith('.js')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (content.includes('FROM students') && !fullPath.includes('rewrite_sql_joins.js')) {
        results.push(fullPath);
      }
    }
  });
  return results;
}

const files = findFilesWithQuery(path.join(process.cwd(), 'backend'));

let modifiedCount = 0;

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let original = content;

  // Pattern 1: SELECT * FROM students
  const joinStudents = " LEFT JOIN colleges ON students.college_id = colleges.id LEFT JOIN courses ON students.course_id = courses.id LEFT JOIN course_branches ON students.branch_id = course_branches.id";
  const selectStudents = "SELECT students.*, colleges.name as college, courses.name as course, course_branches.name as branch FROM students";
  
  content = content.replace(/SELECT\s+\*\s+FROM\s+students(?!\s+s\b)(?!\s+LEFT JOIN)/g, selectStudents + joinStudents);

  // Pattern 2: SELECT s.* FROM students s
  const joinS = " LEFT JOIN colleges ON s.college_id = colleges.id LEFT JOIN courses ON s.course_id = courses.id LEFT JOIN course_branches ON s.branch_id = course_branches.id";
  // We have to be careful with `SELECT s.*, other FROM students s`
  // Let's replace the FROM part if it has SELECT s.*
  // Actually, standardizing: replace `FROM students s` with `FROM students s LEFT JOIN ...` ONLY if the query selects `s.*` or `s.branch` etc.
  // A safer regex: if `SELECT ` contains `s.*` and `FROM students s`, we inject the joined columns and the joins.
  
  // Replace: SELECT s.* FROM students s
  // With: SELECT s.*, colleges.name as college, courses.name as course, course_branches.name as branch FROM students s LEFT JOIN ...
  content = content.replace(/SELECT\s+s\.\*\s+FROM\s+students\s+s(?!\s+LEFT JOIN)/g, "SELECT s.*, colleges.name as college, courses.name as course, course_branches.name as branch FROM students s" + joinS);

  // Replace: SELECT s.*, [something] FROM students s
  // This is trickier because [something] can be multiple lines. 
  // Let's just find `FROM students s` and inject the JOIN, and hope `s.*` already includes it? No, `s.*` doesn't include joined tables unless we select them.
  // Let's do a more generic replacement for any `FROM students s` where we also inject the column selections.
  // To avoid breaking complex queries, let's strictly replace `SELECT s.*,` with `SELECT s.*, colleges.name as college, courses.name as course, course_branches.name as branch,`
  // And `FROM students s` with `FROM students s LEFT JOIN ...`
  
  // 1. Inject columns into `SELECT s.*,`
  if (content.includes('FROM students s')) {
    // Only do this if we haven't already joined colleges
    if (!content.includes('LEFT JOIN colleges ON s.college_id')) {
        content = content.replace(/SELECT\s+s\.\*(?!\s*,\s*colleges\.name)/g, "SELECT s.*, colleges.name as college, courses.name as course, course_branches.name as branch");
        content = content.replace(/FROM\s+students\s+s(?!\s+LEFT JOIN colleges)/g, "FROM students s" + joinS);
    }
  }

  // Same for `students a` or something? Usually it's `s`.
  
  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
    console.log('Modified:', file.replace(process.cwd(), ''));
    modifiedCount++;
  }
});

console.log(`Total files modified: ${modifiedCount}`);
