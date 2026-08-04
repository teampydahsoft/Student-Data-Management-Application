/**
 * Migration Script: Consolidate Duplicate Branches
 * 
 * This script:
 * 1. Creates branch_academic_years junction table
 * 2. Identifies duplicate branches (same course_id, name, code)
 * 3. Consolidates duplicates into single branches
 * 4. Migrates academic_year_id to junction table
 * 5. Updates RBAC users branch_id references
 * 6. Removes academic_year_id column from course_branches
 * 
 * Run with: node scripts/migrate_consolidate_branches.js
 */

const { masterPool } = require('../config/database');

async function consolidateBranches() {
  console.log('🚀 Starting Branch Consolidation Migration...\n');
  
  const connection = await masterPool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    // Step 1: Create branch_academic_years junction table
    console.log('📦 Step 1: Creating branch_academic_years junction table...');
    await connection.query(`
      CREATE TABLE IF NOT EXISTS branch_academic_years (
        branch_id INT NOT NULL,
        academic_year_id INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (branch_id, academic_year_id),
        FOREIGN KEY (branch_id) REFERENCES course_branches(id) ON DELETE CASCADE,
        FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE CASCADE,
        INDEX idx_branch_id (branch_id),
        INDEX idx_academic_year_id (academic_year_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('   ✅ Junction table created\n');
    
    // Step 2: Check if academic_year_id column exists
    console.log('📊 Step 2: Checking database structure...');
    const [columns] = await connection.query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'course_branches'
        AND COLUMN_NAME = 'academic_year_id';
    `);
    
    const hasAcademicYearId = columns.length > 0;
    console.log(`   academic_year_id column exists: ${hasAcademicYearId}\n`);
    
    // Step 3: Analyze duplicates
    console.log('📊 Step 3: Analyzing duplicate branches...');
    let duplicates = [];
    
    if (hasAcademicYearId) {
      const [dupRows] = await connection.query(`
        SELECT 
          course_id,
          name,
          COALESCE(code, '') as code,
          COUNT(*) as count,
          GROUP_CONCAT(DISTINCT id ORDER BY created_at DESC, id ASC SEPARATOR ',') as branch_ids,
          GROUP_CONCAT(DISTINCT academic_year_id ORDER BY academic_year_id SEPARATOR ',') as academic_year_ids
        FROM course_branches
        GROUP BY course_id, name, COALESCE(code, '')
        HAVING count > 1
        ORDER BY count DESC;
      `);
      duplicates = dupRows;
    } else {
      // If academic_year_id doesn't exist, check for duplicates by name/code only
      const [dupRows] = await connection.query(`
        SELECT 
          course_id,
          name,
          COALESCE(code, '') as code,
          COUNT(*) as count,
          GROUP_CONCAT(DISTINCT id ORDER BY created_at DESC, id ASC SEPARATOR ',') as branch_ids,
          '' as academic_year_ids
        FROM course_branches
        GROUP BY course_id, name, COALESCE(code, '')
        HAVING count > 1
        ORDER BY count DESC;
      `);
      duplicates = dupRows;
    }
    
    console.log(`   Found ${duplicates.length} duplicate branch groups\n`);
    
    if (duplicates.length === 0) {
      console.log('   ✅ No duplicates found. Migration may have already been run.\n');
      // Still migrate non-duplicates if academic_year_id exists
      if (hasAcademicYearId) {
        console.log('   📦 Migrating non-duplicate branches to junction table...');
        const [nonDuplicateBranches] = await connection.query(`
          SELECT id, academic_year_id
          FROM course_branches
          WHERE academic_year_id IS NOT NULL
            AND id NOT IN (
              SELECT DISTINCT branch_id FROM branch_academic_years
            );
        `);
        
        let migratedCount = 0;
        for (const branch of nonDuplicateBranches) {
          try {
            await connection.query(`
              INSERT IGNORE INTO branch_academic_years (branch_id, academic_year_id)
              VALUES (?, ?);
            `, [branch.id, branch.academic_year_id]);
            migratedCount++;
          } catch (error) {
            if (error.code !== 'ER_DUP_ENTRY') {
              throw error;
            }
          }
        }
        console.log(`   ✅ Migrated ${migratedCount} non-duplicate branches\n`);
      }
      await connection.commit();
      connection.release();
      return;
    }
    
    // Step 4: Check for RBAC users referencing branches
    console.log('🔍 Step 4: Checking RBAC user references...');
    const [rbacUsers] = await connection.query(`
      SELECT DISTINCT branch_id, branch_ids
      FROM rbac_users
      WHERE branch_id IS NOT NULL OR (branch_ids IS NOT NULL AND branch_ids != '[]' AND branch_ids != 'null');
    `);
    console.log(`   Found ${rbacUsers.length} RBAC users with branch references\n`);
    
    // Step 5: Consolidate duplicates
    console.log('🔄 Step 5: Consolidating duplicate branches...');
    let consolidatedCount = 0;
    let junctionEntriesCreated = 0;
    const branchIdMapping = new Map(); // old_id -> new_id
    
    for (const duplicate of duplicates) {
      const branchIds = duplicate.branch_ids.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
      const academicYearIds = hasAcademicYearId && duplicate.academic_year_ids
        ? duplicate.academic_year_ids
            .split(',')
            .map(id => {
              const trimmed = id.trim();
              return trimmed === 'NULL' || trimmed === '' || trimmed === 'null' ? null : parseInt(trimmed);
            })
            .filter(id => id !== null && !isNaN(id))
        : [];
      
      // Keep the first branch (most recent created_at, or lowest id)
      const [branches] = await connection.query(`
        SELECT id, academic_year_id, created_at
        FROM course_branches
        WHERE id IN (?)
        ORDER BY created_at DESC, id ASC;
      `, [branchIds]);
      
      if (branches.length === 0) continue;
      
      const keepBranch = branches[0];
      const duplicateBranches = branches.slice(1);
      
      // Map all duplicate branch IDs to the kept branch ID
      for (const dupBranch of duplicateBranches) {
        branchIdMapping.set(dupBranch.id, keepBranch.id);
      }
      
      // Collect all academic_year_ids from all branches in this group
      const allAcademicYearIds = new Set();
      
      if (hasAcademicYearId) {
        // Add academic_year_id from kept branch
        if (keepBranch.academic_year_id) {
          allAcademicYearIds.add(keepBranch.academic_year_id);
        }
        
        // Add academic_year_ids from duplicate branches
        for (const dupBranch of duplicateBranches) {
          if (dupBranch.academic_year_id) {
            allAcademicYearIds.add(dupBranch.academic_year_id);
          }
        }
        
        // Also check the original academic_year_ids from the query
        for (const yearId of academicYearIds) {
          if (yearId) allAcademicYearIds.add(yearId);
        }
      }
      
      // Insert all academic_year_ids into junction table
      for (const yearId of allAcademicYearIds) {
        try {
          await connection.query(`
            INSERT IGNORE INTO branch_academic_years (branch_id, academic_year_id)
            VALUES (?, ?);
          `, [keepBranch.id, yearId]);
          junctionEntriesCreated++;
        } catch (error) {
          // Ignore duplicate key errors
          if (error.code !== 'ER_DUP_ENTRY') {
            throw error;
          }
        }
      }
      
      consolidatedCount++;
      console.log(`   ✅ Consolidated: ${duplicate.name} (course_id: ${duplicate.course_id}) - Kept branch_id: ${keepBranch.id}, Merged ${duplicateBranches.length} duplicates`);
    }
    
    console.log(`\n   Total: ${consolidatedCount} branch groups consolidated, ${junctionEntriesCreated} junction entries created\n`);
    
    // Step 6: Update RBAC users branch_id references
    console.log('👥 Step 6: Updating RBAC user branch references...');
    let rbacUpdated = 0;
    
    for (const [oldBranchId, newBranchId] of branchIdMapping.entries()) {
      // Update single branch_id
      const [updateResult] = await connection.query(`
        UPDATE rbac_users
        SET branch_id = ?
        WHERE branch_id = ?;
      `, [newBranchId, oldBranchId]);
      
      if (updateResult.affectedRows > 0) {
        rbacUpdated += updateResult.affectedRows;
      }
      
      // Update branch_ids JSON array
      const [usersWithBranchIds] = await connection.query(`
        SELECT id, branch_ids
        FROM rbac_users
        WHERE branch_ids IS NOT NULL 
          AND branch_ids != '[]' 
          AND branch_ids != 'null'
          AND JSON_CONTAINS(branch_ids, ?);
      `, [JSON.stringify(oldBranchId)]);
      
      for (const user of usersWithBranchIds) {
        try {
          let branchIds = JSON.parse(user.branch_ids || '[]');
          if (Array.isArray(branchIds)) {
            const index = branchIds.indexOf(oldBranchId);
            if (index !== -1) {
              branchIds[index] = newBranchId;
              // Remove duplicates
              branchIds = [...new Set(branchIds)];
              
              await connection.query(`
                UPDATE rbac_users
                SET branch_ids = CAST(? AS JSON)
                WHERE id = ?;
              `, [JSON.stringify(branchIds), user.id]);
              rbacUpdated++;
            }
          }
        } catch (error) {
          console.log(`   ⚠️  Warning: Could not update branch_ids for user ${user.id}: ${error.message}`);
        }
      }
    }
    
    console.log(`   ✅ Updated ${rbacUpdated} RBAC user references\n`);
    
    // Step 7: Migrate remaining branches (non-duplicates) to junction table
    console.log('📦 Step 7: Migrating non-duplicate branches to junction table...');
    let migratedCount = 0;
    
    if (hasAcademicYearId) {
      const [nonDuplicateBranches] = await connection.query(`
        SELECT id, academic_year_id
        FROM course_branches
        WHERE academic_year_id IS NOT NULL
          AND id NOT IN (
            SELECT DISTINCT branch_id FROM branch_academic_years
          );
      `);
      
      for (const branch of nonDuplicateBranches) {
        try {
          await connection.query(`
            INSERT IGNORE INTO branch_academic_years (branch_id, academic_year_id)
            VALUES (?, ?);
          `, [branch.id, branch.academic_year_id]);
          migratedCount++;
        } catch (error) {
          if (error.code !== 'ER_DUP_ENTRY') {
            throw error;
          }
        }
      }
    }
    
    console.log(`   ✅ Migrated ${migratedCount} non-duplicate branches\n`);
    
    // Step 8: Remove academic_year_id column (make it nullable first, then drop)
    console.log('🗑️  Step 8: Removing academic_year_id column from course_branches...');
    
    // Check if column exists (we already checked earlier, but check again to be safe)
    if (hasAcademicYearId) {
      // Drop foreign key constraint if exists (MySQL doesn't support IF EXISTS for FK, so we need to check first)
      try {
        const [fkCheck] = await connection.query(`
          SELECT CONSTRAINT_NAME
          FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'course_branches'
            AND CONSTRAINT_NAME = 'fk_branch_academic_year'
            AND REFERENCED_TABLE_NAME IS NOT NULL;
        `);
        
        if (fkCheck.length > 0) {
          await connection.query(`
            ALTER TABLE course_branches
            DROP FOREIGN KEY fk_branch_academic_year;
          `);
          console.log('   ✅ Dropped foreign key constraint');
        }
      } catch (error) {
        console.log(`   ⚠️  Could not drop foreign key: ${error.message}`);
      }
      
      // Drop index if exists
      try {
        await connection.query(`
          ALTER TABLE course_branches
          DROP INDEX IF EXISTS idx_branch_academic_year;
        `);
      } catch (error) {
        // Ignore if index doesn't exist
      }
      
      // First, ensure the old unique constraints exist (without academic_year_id)
      // This is needed because after consolidation, we have unique branches per course
      try {
        await connection.query(`
          ALTER TABLE course_branches
          ADD UNIQUE KEY unique_branch_per_course (course_id, name);
        `);
        console.log('   ✅ Added unique_branch_per_course constraint (without academic_year_id)');
      } catch (error) {
        if (error.code !== 'ER_DUP_KEY') {
          console.log(`   ⚠️  Could not add unique_branch_per_course: ${error.message}`);
        } else {
          console.log('   ℹ️  unique_branch_per_course constraint already exists');
        }
      }
      
      try {
        await connection.query(`
          ALTER TABLE course_branches
          ADD UNIQUE KEY unique_branch_code_per_course (course_id, code);
        `);
        console.log('   ✅ Added unique_branch_code_per_course constraint (without academic_year_id)');
      } catch (error) {
        if (error.code !== 'ER_DUP_KEY') {
          console.log(`   ⚠️  Could not add unique_branch_code_per_course: ${error.message}`);
        } else {
          console.log('   ℹ️  unique_branch_code_per_course constraint already exists');
        }
      }
      
      // Now drop unique constraints that include academic_year_id
      const [constraints] = await connection.query(`
        SELECT CONSTRAINT_NAME
        FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'course_branches'
          AND CONSTRAINT_TYPE = 'UNIQUE'
          AND CONSTRAINT_NAME IN ('unique_branch_code_per_course_year', 'unique_branch_per_course_year');
      `);
      
      for (const constraint of constraints) {
        try {
          // Check if it's used by a foreign key first
          const [fkCheck] = await connection.query(`
            SELECT CONSTRAINT_NAME
            FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'course_branches'
              AND CONSTRAINT_NAME = ?
              AND REFERENCED_TABLE_NAME IS NOT NULL;
          `, [constraint.CONSTRAINT_NAME]);
          
          if (fkCheck.length === 0) {
            await connection.query(`
              ALTER TABLE course_branches
              DROP INDEX ${constraint.CONSTRAINT_NAME};
            `);
            console.log(`   ✅ Dropped constraint: ${constraint.CONSTRAINT_NAME}`);
          } else {
            console.log(`   ⚠️  Skipping ${constraint.CONSTRAINT_NAME} - used by foreign key`);
          }
        } catch (error) {
          console.log(`   ⚠️  Could not drop constraint ${constraint.CONSTRAINT_NAME}: ${error.message}`);
        }
      }
      
      // Remove the column (this will fail if constraint still exists, but that's okay - we'll handle it)
      try {
        await connection.query(`
          ALTER TABLE course_branches
          DROP COLUMN academic_year_id;
        `);
        console.log('   ✅ academic_year_id column removed');
      } catch (error) {
        if (error.code === 'ER_FK_COLUMN_CANNOT_DROP' || error.code === 'ER_DUP_ENTRY') {
          console.log(`   ⚠️  Cannot drop column yet: ${error.message}`);
          console.log('   ℹ️  Column will remain but junction table is now the source of truth');
        } else {
          throw error;
        }
      }
      
      console.log('   ✅ academic_year_id column removed\n');
    } else {
      console.log('   ℹ️  academic_year_id column does not exist (may have been removed already)\n');
    }
    
    // Step 9: Delete duplicate branch rows
    console.log('🗑️  Step 9: Deleting duplicate branch rows...');
    const duplicateBranchIds = Array.from(branchIdMapping.keys());
    
    if (duplicateBranchIds.length > 0) {
      // Check if any students reference these branches by name (they shouldn't, but let's be safe)
      const [studentRefs] = await connection.query(`
        SELECT DISTINCT cb.id, cb.name
        FROM course_branches cb
        WHERE cb.id IN (?)
          AND EXISTS (
            SELECT 1 FROM students s LEFT JOIN colleges ON s.college_id = colleges.id LEFT JOIN courses ON s.course_id = courses.id LEFT JOIN course_branches ON s.branch_id = course_branches.id
            WHERE s.branch = cb.name
          );
      `, [duplicateBranchIds]);
      
      if (studentRefs.length > 0) {
        console.log(`   ⚠️  Warning: ${studentRefs.length} duplicate branches are referenced by students (by name). These will be kept but duplicates will be deleted.`);
      }
      
      // Delete duplicate branches (cascade will handle junction table)
      const [deleteResult] = await connection.query(`
        DELETE FROM course_branches
        WHERE id IN (?);
      `, [duplicateBranchIds]);
      
      console.log(`   ✅ Deleted ${deleteResult.affectedRows} duplicate branch rows\n`);
    } else {
      console.log('   ℹ️  No duplicate branches to delete\n');
    }
    
    // Step 10: Verify migration
    console.log('✅ Step 10: Verifying migration...');
    const [finalDuplicates] = await connection.query(`
      SELECT course_id, name, code, COUNT(*) as count
      FROM course_branches
      GROUP BY course_id, name, COALESCE(code, '')
      HAVING count > 1;
    `);
    
    if (finalDuplicates.length > 0) {
      console.log(`   ⚠️  Warning: ${finalDuplicates.length} duplicate groups still exist`);
    } else {
      console.log('   ✅ No duplicates remaining');
    }
    
    const [junctionCount] = await connection.query(`
      SELECT COUNT(*) as count FROM branch_academic_years;
    `);
    console.log(`   ✅ Junction table has ${junctionCount[0].count} entries\n`);
    
    await connection.commit();
    console.log('🎉 Migration completed successfully!\n');
    
  } catch (error) {
    await connection.rollback();
    console.error('❌ Migration failed:', error.message);
    console.error(error);
    throw error;
  } finally {
    connection.release();
    process.exit(0);
  }
}

consolidateBranches().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
