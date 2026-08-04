const mysql = require('mysql2/promise');
require('dotenv').config();

async function createDefaultFormForCompletion() {
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

    console.log('🏗️ Creating Default Form for Completion Calculation');
    console.log('================================================');

    // Create a default form with all the expected fields
    const defaultFormId = 'default_student_form';
    const defaultFormFields = [
      { key: 'student_name', label: 'Student Name', type: 'text', required: true },
      { key: 'dob', label: 'Date of Birth', type: 'date', required: true },
      { key: 'batch', label: 'Batch', type: 'text', required: true },
      { key: 'caste', label: 'Caste', type: 'text', required: false },
      { key: 'branch', label: 'Branch', type: 'text', required: true },
      { key: 'gender', label: 'Gender', type: 'select', required: true },
      { key: 'pin_no', label: 'PIN Number', type: 'text', required: false },
      { key: 'remarks', label: 'Remarks', type: 'textarea', required: false },
      { key: 'adhar_no', label: 'Aadhar Number', type: 'text', required: false },
      { key: 'district', label: 'District', type: 'text', required: false },
      { key: 'stud_type', label: 'Student Type', type: 'text', required: false },
      { key: 'father_name', label: 'Father Name', type: 'text', required: false },
      { key: 'mandal_name', label: 'Mandal Name', type: 'text', required: false },
      { key: 'city_village', label: 'City/Village', type: 'text', required: false },
      { key: 'admission_date', label: 'Admission Date', type: 'date', required: false },
      { key: 'parent_mobile1', label: 'Parent Mobile 1', type: 'text', required: false },
      { key: 'parent_mobile2', label: 'Parent Mobile 2', type: 'text', required: false },
      { key: 'scholar_status', label: 'Scholar Status', type: 'text', required: false },
      { key: 'student_mobile', label: 'Student Mobile', type: 'text', required: false },
      { key: 'student_status', label: 'Student Status', type: 'text', required: false },
      { key: 'student_address', label: 'Student Address', type: 'textarea', required: false },
      { key: 'previous_college', label: 'Previous College', type: 'text', required: false },
      { key: 'certificates_status', label: 'Certificates Status', type: 'text', required: false }
    ];

    console.log(`📋 Creating default form with ${defaultFormFields.length} fields`);

    // Insert the form
    await connection.execute(`
      INSERT INTO forms (form_id, form_name, form_fields)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE
      form_name = VALUES(form_name),
      form_fields = VALUES(form_fields)
    `, [
      defaultFormId,
      'Default Student Registration Form',
      JSON.stringify(defaultFormFields)
    ]);

    console.log(`✅ Default form created/updated: ${defaultFormId}`);

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
    }

    // Test completion calculation
    console.log('\n🧪 Testing completion calculation with default form...');

    const [testStudents] = await connection.execute(
      'SELECT students.*, colleges.name as college, courses.name as course, course_branches.name as branch FROM students LEFT JOIN colleges ON students.college_id = colleges.id LEFT JOIN courses ON students.course_id = courses.id LEFT JOIN course_branches ON students.branch_id = course_branches.id WHERE admission_number = ? OR admission_no = ?',
      ['ADM001', 'ADM001']
    );

    if (testStudents.length > 0) {
      const student = testStudents[0];

      // Parse student_data to get form_id
      let studentData = {};
      if (student.student_data) {
        try {
          studentData = typeof student.student_data === 'string'
            ? JSON.parse(student.student_data)
            : student.student_data;
        } catch (error) {
          console.log(`❌ Could not parse student_data JSON`);
        }
      }

      if (studentData.form_id) {
        const [testForms] = await connection.execute(
          'SELECT form_fields FROM forms WHERE form_id = ?',
          [studentData.form_id]
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

            // Check individual database columns first (preferred)
            if (student[key] !== undefined && student[key] !== null && student[key] !== '') {
              completedFields++;
              console.log(`   ✅ ${key}: Found in database column`);
            }
            // Check student_data JSON as fallback
            else if (studentData[key] !== undefined && studentData[key] !== null && studentData[key] !== '') {
              completedFields++;
              console.log(`   ✅ ${key}: Found in JSON data`);
            } else {
              console.log(`   ❌ ${key}: Not found or empty`);
            }
          }

          const completionPercentage = allFields.length > 0 ? Math.round((completedFields / allFields.length) * 100) : 0;
          console.log(`📈 Completion calculation: ${completedFields}/${allFields.length} = ${completionPercentage}%`);

          if (completionPercentage === 100) {
            console.log(`✅ SUCCESS: Completion percentage is now 100%!`);
          } else {
            console.log(`❌ ISSUE: Completion percentage is ${completionPercentage}% (expected 100%)`);
            console.log(`   Missing fields: ${allFields.length - completedFields}`);
          }
        } else {
          console.log(`❌ Form ${studentData.form_id} not found`);
        }
      } else {
        console.log(`❌ Student ADM001 still missing form_id`);
      }
    }

    console.log('\n🎉 Default form creation completed!');
    console.log('📝 Summary:');
    console.log('   - Created default form with all expected fields');
    console.log('   - Updated student with form_id');
    console.log('   - Tested completion calculation');

  } catch (error) {
    console.error('❌ Creation failed:', error.message);
    console.error('💡 Make sure your database credentials in .env are correct');
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('🔌 Database connection closed');
    }
  }
}

// Run the creation
createDefaultFormForCompletion();