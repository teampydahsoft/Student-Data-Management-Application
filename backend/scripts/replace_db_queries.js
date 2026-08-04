const fs = require('fs');
const path = require('path');

const files = [
  'controllers/attendanceController.js',
  'controllers/hourlyAttendanceController.js',
  'internship/internshipController.js',
  'internship/internshipController_append.js',
  'controllers/profileChangeController.js',
  'controllers/feedbackController.js',
  'controllers/feeController.js',
  'controllers/submissionController.js',
  'services/studentScholarshipSync.js',
  'services/sectionAssignmentService.js'
];

function replacePattern(content, fieldName, idFieldName) {
  // We want to match various assignment patterns:
  // query += ' AND s.course = ?'; params.push(course);
  // We will do this safely using regex
  
  // 1. Match: if (field) { queryVar += ' AND s.field = ?'; paramsVar.push(field); }
  const regex1 = new RegExp(`if\\s*\\(${fieldName}\\)\\s*\\{\\s*([a-zA-Z0-9_]+)\\s*\\+=\\s*['"\`]\\s*AND\\s*s\\.${fieldName}\\s*=\\s*\\?['"\`]\\s*;\\s*([a-zA-Z0-9_]+)\\.push\\(${fieldName}\\);\\s*\\}`, 'g');
  
  content = content.replace(regex1, (match, qVar, pVar) => {
    return `if (${fieldName}) {
      if (/^\\d+$/.test(${fieldName})) {
        ${qVar} += ' AND s.${idFieldName} = ?';
        ${pVar}.push(parseInt(${fieldName}, 10));
      } else {
        ${qVar} += ' AND s.${fieldName} = ?';
        ${pVar}.push(${fieldName});
      }
    }`;
  });

  // 2. Match: queryVar += ' AND s.field = ?'; paramsVar.push(field);
  // (Not inside an if block, but consecutive lines)
  const regex2 = new RegExp(`([a-zA-Z0-9_]+)\\s*\\+=\\s*['"\`]\\s*AND\\s*s\\.${fieldName}\\s*=\\s*\\?['"\`]\\s*;\\s*([a-zA-Z0-9_]+)\\.push\\(${fieldName}\\);`, 'g');
  
  content = content.replace(regex2, (match, qVar, pVar) => {
    // Check if it's already in our new block
    if (match.includes(`s.${idFieldName} = ?`)) return match;
    
    return `if (/^\\d+$/.test(${fieldName})) {
        ${qVar} += ' AND s.${idFieldName} = ?';
        ${pVar}.push(parseInt(${fieldName}, 10));
      } else {
        ${qVar} += ' AND s.${fieldName} = ?';
        ${pVar}.push(${fieldName});
      }`;
  });
  
  // 3. Match array push: whereConditions.push('s.field = ?');
  const regex3 = new RegExp(`([a-zA-Z0-9_]+)\\.push\\(['"\`]s\\.${fieldName}\\s*=\\s*\\?['"\`]\\);`, 'g');
  content = content.replace(regex3, (match, arrVar) => {
    return `if (/^\\d+$/.test(${fieldName})) {
        ${arrVar}.push('s.${idFieldName} = ?');
      } else {
        ${arrVar}.push('s.${fieldName} = ?');
      }`;
  });

  return content;
}

files.forEach(filePath => {
  const fullPath = path.join(process.cwd(), filePath);
  if (fs.existsSync(fullPath)) {
    let content = fs.readFileSync(fullPath, 'utf8');
    let original = content;
    
    content = replacePattern(content, 'college', 'college_id');
    content = replacePattern(content, 'course', 'course_id');
    content = replacePattern(content, 'branch', 'branch_id');
    
    if (content !== original) {
      fs.writeFileSync(fullPath, content, 'utf8');
      console.log(`Updated: ${filePath}`);
    }
  } else {
    console.log(`Not found: ${filePath}`);
  }
});
