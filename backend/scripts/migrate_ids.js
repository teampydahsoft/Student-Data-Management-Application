const { masterPool } = require('../config/database');

const delay = ms => new Promise(res => setTimeout(res, ms));

const DRY_RUN = false; // Set to false to actually modify the database

async function run() {
  try {
    // Columns already exist, proceeding directly to data loading

    console.log("Loading mapping data into memory...");
    const [colleges] = await masterPool.execute("SELECT * FROM colleges");
    const [courses] = await masterPool.execute("SELECT * FROM courses");
    const [branches] = await masterPool.execute("SELECT * FROM course_branches");

    // Lookup functions that handle missing records gracefully
    const findCollegeId = (str) => {
      if (!str) return null;
      str = str.toLowerCase().trim();
      let match = colleges.find(c => c.name.toLowerCase().trim() === str || (c.code && c.code.toLowerCase().trim() === str));
      return match ? match.id : null;
    };

    const findCourseId = (str, collId) => {
      if (!str) return null;
      str = str.toLowerCase().trim();
      let match = courses.find(c => c.name.toLowerCase().trim() === str && c.college_id === collId);
      if (!match) {
        match = courses.find(c => c.name.toLowerCase().trim() === str);
      }
      return match ? match.id : null;
    };

    const findBranchId = (str, courseId) => {
      if (!str) return null;
      str = str.toLowerCase().trim();
      let match = branches.find(b => b.name.toLowerCase().trim() === str && b.course_id === courseId);
      if (!match) {
        match = branches.find(b => b.name.toLowerCase().trim() === str);
      }
      return match ? match.id : null;
    };

    let totalProcessed = 0;
    let totalUpdated = 0;
    const batchSize = 100;

    console.log("Starting batched update...");

    while (true) {
      // Find students who haven't been mapped yet. 
      // Note: We use IFNULL checks so that if a student genuinely has no matching ID (e.g. invalid string), 
      // we still mark them as processed to avoid an infinite loop. We'll use a temporary flag or just fetch sequentially using LIMIT OFFSET.
      
      const [students] = await masterPool.execute(
        `SELECT id, student_name, college, course, branch FROM students 
         ORDER BY id ASC
         LIMIT ${batchSize} OFFSET ${totalProcessed}`
      );

      if (students.length === 0) {
        break; // No more records
      }

      for (let s of students) {
        const cId = findCollegeId(s.college);
        const coId = findCourseId(s.course, cId);
        const bId = findBranchId(s.branch, coId);

        // We only perform the UPDATE if something needs to change to reduce load
        if (!DRY_RUN) {
          await masterPool.execute(
            "UPDATE students SET college_id = ?, course_id = ?, branch_id = ? WHERE id = ?",
            [cId, coId, bId, s.id]
          );
        }
        totalUpdated++;
        
        const modeLabel = DRY_RUN ? "[DRY RUN]" : "[UPDATE]";
        console.log(`${modeLabel} Student #${s.id} (${s.student_name || 'N/A'}) | Col: ${s.college}->${cId || 'NULL'} | Crse: ${s.course}->${coId || 'NULL'} | Br: ${s.branch}->${bId || 'NULL'}`);
      }

      totalProcessed += students.length;
      console.log(`--- Finished batch. Total Processed so far: ${totalProcessed} ---`);
      
      // Delay to avoid table locking and DB overwhelming
      await delay(50); 
    }

    console.log(`Done! Total students processed: ${totalProcessed}. Total updates pushed: ${totalUpdated}`);
    process.exit(0);

  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

run();
