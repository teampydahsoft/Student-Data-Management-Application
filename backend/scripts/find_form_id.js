const mysql = require('mysql2/promise');
require('dotenv').config();

async function findFormId() {
  let connection;

  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      ssl: process.env.DB_SSL === 'true' ? {
        rejectUnauthorized: false
      } : false
    });

    console.log('🔍 Finding Form ID for Student ADM001');
    console.log('===================================');

    // Check form_submissions table
    console.log('\n📋 Checking form_submissions table...');
    const [submissions] = await connection.execute(`
      SELECT submission_id, form_id, admission_number, status, submission_data
      FROM form_submissions
      WHERE admission_number = 'ADM001'
    `);

    console.log(`Found ${submissions.length} submissions for ADM001:`);
    submissions.forEach(sub => {
      console.log(`   - Submission ID: ${sub.submission_id}`);
      console.log(`   - Form ID: ${sub.form_id}`);
      console.log(`   - Status: ${sub.status}`);
      console.log(`   - Admission: ${sub.admission_number}`);
    });

    // Check if there are any forms in the database
    console.log('\n📋 Checking forms table...');
    const [forms] = await connection.execute(`
      SELECT form_id, form_name FROM forms LIMIT 5
    `);

    console.log(`Found ${forms.length} forms:`);
    forms.forEach(form => {
      console.log(`   - Form ID: ${form.form_id}`);
      console.log(`   - Form Name: ${form.form_name}`);
    });

    if (forms.length > 0) {
      const defaultFormId = forms[0].form_id;
      console.log(`\n📋 Using first available form_id: ${defaultFormId}`);

      // Update student ADM001 with the form_id
      const [students] = await connection.execute(
        'SELECT student_data FROM students WHERE admission_number = ? OR admission_no = ?',
        ['ADM001', 'ADM001']
      );

      if (students.length > 0) {
        let studentData = {};
        if (students[0].student_data) {
          try {
            studentData = typeof students[0].student_data === 'string'
              ? JSON.parse(students[0].student_data)
              : students[0].student_data;
          } catch (error) {
            console.log(`❌ Could not parse student_data JSON`);
          }
        }

        // Add form_id
        studentData.form_id = defaultFormId;
        const updatedJsonData = JSON.stringify(studentData);

        await connection.execute(
          'UPDATE students SET student_data = ? WHERE admission_number = ? OR admission_no = ?',
          [updatedJsonData, 'ADM001', 'ADM001']
        );

        console.log(`✅ Successfully added form_id ${defaultFormId} to student ADM001`);

        // Test completion calculation
        console.log('\n🧪 Testing completion calculation...');

        const [testStudents] = await connection.execute(
          'SELECT students.*, colleges.name as college, courses.name as course, course_branches.name as branch FROM students LEFT JOIN colleges ON students.college_id = colleges.id LEFT JOIN courses ON students.course_id = courses.id LEFT JOIN course_branches ON students.branch_id = course_branches.id WHERE admission_number = ? OR admission_no = ?',
          ['ADM001', 'ADM001']
        );

        if (testStudents.length > 0) {
          const student = testStudents[0];

          // Get form fields
          const [testForms] = await connection.execute(
            'SELECT form_fields FROM forms WHERE form_id = ?',
            [defaultFormId]
          );

          if (testForms.length > 0) {
            const formFields = typeof testForms[0].form_fields === 'string'
              ? JSON.parse(testForms[0].form_fields)
              : testForms[0].form_fields;

            const allFields = formFields.filter(field => field.key);
            console.log(`📊 Form has ${allFields.length} fields`);

            let completedFields = 0;

            for (const field of allFields) {
              const key = field.key;

              // Check individual database columns
              if (student[key] !== undefined && student[key] !== null && student[key] !== '') {
                completedFields++;
              }
              // Check student_data JSON
              else if (studentData[key] !== undefined && studentData[key] !== null && studentData[key] !== '') {
                completedFields++;
              }
            }

            const completionPercentage = allFields.length > 0 ? Math.round((completedFields / allFields.length) * 100) : 0;
            console.log(`📈 Completion calculation: ${completedFields}/${allFields.length} = ${completionPercentage}%`);

            if (completionPercentage === 100) {
              console.log(`✅ Completion percentage is now 100%!`);
            } else {
              console.log(`❌ Completion percentage is ${completionPercentage}% (expected 100%)`);
            }
          }
        }
      }
    }

    console.log('\n🎉 Form ID search completed!');

  } catch (error) {
    console.error('❌ Search failed:', error.message);
    console.error('💡 Make sure your database credentials in .env are correct');
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('🔌 Database connection closed');
    }
  }
}

// Run the search
findFormId();