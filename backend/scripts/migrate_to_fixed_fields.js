/**
 * Migration script to convert existing student data from dynamic JSON format to fixed fields
 * Run this script after updating the database schema
 */

const { pool } = require('../config/database');

async function migrateStudentData() {
  console.log('Starting migration of student data to fixed fields format...');
  
  try {
    // Get connection from pool
    const connection = await pool.getConnection();
    
    try {
      // Begin transaction
      await connection.beginTransaction();
      
      // Check if old students table exists
      const [oldTableCheck] = await connection.query(`
        SELECT COUNT(*) as tableExists 
        FROM information_schema.tables 
        WHERE table_schema = DATABASE() 
        AND table_name = 'students_old'
      `);
      
      if (oldTableCheck[0].tableExists === 0) {
        // Rename current students table to students_old
        console.log('Renaming current students table to students_old...');
        await connection.query('RENAME TABLE students TO students_old');
        
        // Create new students table with fixed fields
        console.log('Creating new students table with fixed fields...');
        await connection.query(`
          CREATE TABLE students (
            id INT PRIMARY KEY AUTO_INCREMENT,
            pin_no VARCHAR(50),
            batch VARCHAR(50),
            branch VARCHAR(100),
            stud_type VARCHAR(50),
            student_name VARCHAR(255) NOT NULL,
            student_status VARCHAR(50),
            scholar_status VARCHAR(50),
            student_mobile VARCHAR(20),
            parent_mobile1 VARCHAR(20),
            parent_mobile2 VARCHAR(20),
            caste VARCHAR(50),
            gender ENUM('M', 'F', 'Other'),
            father_name VARCHAR(255),
            dob VARCHAR(50),
            adhar_no VARCHAR(20),
            admission_no VARCHAR(100) UNIQUE NOT NULL,
            pin_no VARCHAR(50),
            student_address TEXT,
            city_village VARCHAR(100),
            mandal_name VARCHAR(100),
            district VARCHAR(100),
            previous_college VARCHAR(255),
            certificates_status VARCHAR(100),
            student_photo LONGTEXT,
            remarks TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_admission (admission_no),
            INDEX idx_pin_no (pin_no),
            INDEX idx_batch (batch),
            INDEX idx_branch (branch)
          )
        `);
        
        // Get all students from old table
        console.log('Fetching students from old table...');
        const [oldStudents] = await connection.query('SELECT students.*, colleges.name as college, courses.name as course, course_branches.name as branch FROM students LEFT JOIN colleges ON students.college_id = colleges.id LEFT JOIN courses ON students.course_id = courses.id LEFT JOIN course_branches ON students.branch_id = course_branches.id_old');
        
        console.log(`Found ${oldStudents.length} students to migrate.`);
        
        // Process each student
        for (const oldStudent of oldStudents) {
          // Check if student_data is already an object or needs parsing
          let studentData;
          if (typeof oldStudent.student_data === 'string') {
            try {
              studentData = JSON.parse(oldStudent.student_data || '{}');
            } catch (error) {
              console.log(`Error parsing JSON for student ${oldStudent.admission_number}: ${error.message}`);
              studentData = {};
            }
          } else if (typeof oldStudent.student_data === 'object') {
            studentData = oldStudent.student_data || {};
          } else {
            studentData = {};
          }
          
          // Map fields from old JSON structure to new fixed fields
          // Note: Field names may need adjustment based on your actual data structure
          const newStudent = {
            pin_no: studentData['Pin No'] || studentData['pin_no'] || null,
            batch: studentData['Batch'] || studentData['batch'] || null,
            branch: studentData['Branch'] || studentData['branch'] || null,
            stud_type: studentData['StudType'] || studentData['stud_type'] || null,
            student_name: studentData['Student Name'] || studentData['student_name'] || 'Unknown',
            student_status: studentData['Student Status'] || studentData['student_status'] || null,
            scholar_status: studentData['Scholar Status'] || studentData['scholar_status'] || null,
            student_mobile: studentData['Student Mobile number'] || studentData['student_mobile'] || null,
            parent_mobile1: studentData['Parent Mobile Number 1'] || studentData['parent_mobile1'] || null,
            parent_mobile2: studentData['Parent Mobile Number 2'] || studentData['parent_mobile2'] || null,
            caste: studentData['Caste'] || studentData['caste'] || null,
            gender: studentData['M/F'] || studentData['gender'] || null,
            father_name: studentData['Father Name'] || studentData['father_name'] || null,
            dob: studentData['DOB'] || studentData['dob'] || null,
            adhar_no: studentData['ADHAR No'] || studentData['adhar_no'] || null,
            admission_no: oldStudent.admission_number,
            pin_no: oldStudent.pin_no || null, // pin_no is the standard field
            student_address: studentData['Student Address'] || studentData['student_address'] || null,
            city_village: studentData['City/Village Name'] || studentData['city_village'] || null,
            mandal_name: studentData['Mandal Name'] || studentData['mandal_name'] || null,
            district: studentData['District'] || studentData['district'] || null,
            previous_college: studentData['Previous College Name'] || studentData['previous_college'] || null,
            certificates_status: studentData['Certificates Status'] || studentData['certificates_status'] || null,
            student_photo: studentData['Student Photo'] || studentData['student_photo'] || null,
            remarks: studentData['Remarks'] || studentData['remarks'] || null,
            created_at: oldStudent.created_at,
            updated_at: oldStudent.updated_at
          };
          
          // Build dynamic insert query
          const fields = Object.keys(newStudent).filter(field => newStudent[field] !== undefined);
          const placeholders = fields.map(() => '?').join(', ');
          const values = fields.map(field => newStudent[field]);
          
          // Insert into new table
          await connection.query(
            `INSERT INTO students (${fields.join(', ')}) VALUES (${placeholders})`,
            values
          );
        }
        
        console.log('Migration completed successfully!');
        await connection.commit();
        
      } else {
        console.log('Migration appears to have been run already (students_old table exists).');
        await connection.rollback();
      }
      
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
    
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

// Run the migration
migrateStudentData();