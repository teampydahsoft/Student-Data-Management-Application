const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { masterPool } = require('../config/database');
const bcrypt = require('bcryptjs');

/**
 * Generate student login credentials
 * Username: PIN number OR mobile number (prefer PIN)
 * Password: First 4 letters of student name + last 4 digits of mobile number
 */
async function createStudentCredentials() {
  let connection;

  try {
    connection = await masterPool.getConnection();
    console.log('📦 Connected to database');

    // Create student_credentials table if it doesn't exist
    console.log('📋 Creating student_credentials table if not exists...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS student_credentials (
        id INT PRIMARY KEY AUTO_INCREMENT,
        student_id INT NOT NULL,
        admission_number VARCHAR(100),
        username VARCHAR(100) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_student_id (student_id),
        INDEX idx_admission_number (admission_number),
        INDEX idx_username (username),
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
      )
    `);
    console.log('✅ Table created/verified');

    // Get all students
    console.log('\n📚 Fetching all students...');
    const [students] = await connection.query(`
      SELECT s.id, s.admission_number, s.pin_no, s.student_name, s.student_mobile
      FROM students s LEFT JOIN colleges ON s.college_id = colleges.id LEFT JOIN courses ON s.course_id = courses.id LEFT JOIN course_branches ON s.branch_id = course_branches.id
      LEFT JOIN student_credentials sc ON s.id = sc.student_id
      WHERE (s.student_status = 'regular' OR s.student_status = 'Regular' OR s.student_status IS NULL)
      AND sc.id IS NULL
      ORDER BY s.id
    `);

    console.log(`Found ${students.length} students to process\n`);

    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;
    const errors = [];

    // Process each student
    for (const student of students) {
      try {
        // Skip if no mobile number
        if (!student.student_mobile || student.student_mobile.trim() === '') {
          console.log(`⚠️  Skipping student ${student.admission_number || student.id}: No mobile number`);
          skippedCount++;
          continue;
        }

        const { resolveStudentLoginUsername } = require('../utils/studentCredentials');
        const username = resolveStudentLoginUsername({
          pinNo: student.pin_no,
          admissionNumber: student.admission_number,
          admissionNo: student.admission_no
        });
        if (!username) {
          console.log(`⚠️  Skipping student ${student.admission_number || student.id}: No admission number for username`);
          skippedCount++;
          continue;
        }

        // Generate password: first 4 letters of student name + last 4 digits of mobile
        const studentName = (student.student_name || '').trim();
        const mobileNumber = student.student_mobile.replace(/\D/g, ''); // Remove non-digits

        if (studentName.length < 4) {
          console.log(`⚠️  Skipping student ${student.admission_number || student.id}: Name too short (${studentName.length} chars)`);
          skippedCount++;
          continue;
        }

        if (mobileNumber.length < 4) {
          console.log(`⚠️  Skipping student ${student.admission_number || student.id}: Mobile number too short`);
          skippedCount++;
          continue;
        }

        // Get first 4 letters (uppercase, remove spaces and special chars)
        const firstFourLetters = studentName
          .replace(/[^a-zA-Z]/g, '') // Remove non-letters
          .substring(0, 4)
          .toUpperCase();

        if (firstFourLetters.length < 4) {
          console.log(`⚠️  Skipping student ${student.admission_number || student.id}: Not enough letters in name`);
          skippedCount++;
          continue;
        }

        // Get last 4 digits of mobile number
        const lastFourDigits = mobileNumber.substring(mobileNumber.length - 4);

        // Combine to create password
        const plainPassword = firstFourLetters + lastFourDigits;

        // Hash password
        const passwordHash = await bcrypt.hash(plainPassword, 10);

        // Insert or update credentials
        await connection.query(`
          INSERT INTO student_credentials (student_id, admission_number, username, password_hash)
          VALUES (?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            password_hash = VALUES(password_hash),
            updated_at = CURRENT_TIMESTAMP
        `, [student.id, student.admission_number, username, passwordHash]);

        successCount++;

        if (successCount % 50 === 0) {
          console.log(`✅ Processed ${successCount} students...`);
        }

      } catch (error) {
        errorCount++;
        const errorMsg = `Error processing student ${student.admission_number || student.id}: ${error.message}`;
        errors.push(errorMsg);
        console.error(`❌ ${errorMsg}`);
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Successfully created/updated: ${successCount} credentials`);
    console.log(`⚠️  Skipped: ${skippedCount} students`);
    console.log(`❌ Errors: ${errorCount} students`);

    if (errors.length > 0 && errors.length <= 20) {
      console.log('\n❌ Error details:');
      errors.forEach(err => console.log(`   - ${err}`));
    } else if (errors.length > 20) {
      console.log(`\n❌ ${errors.length} errors occurred (showing first 20):`);
      errors.slice(0, 20).forEach(err => console.log(`   - ${err}`));
    }

    console.log('\n🎉 Student credentials generation completed!');

  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

// Run the script
createStudentCredentials();

