/**
 * Script to automatically fix orphaned branch names in student records.
 * This will update students with old branch names to match the new active branches.
 * 
 * Usage: node scripts/fix_orphaned_branches.js
 */

require('dotenv').config();
const { masterPool } = require('../config/database');

// Define the mapping of old branch names to new branch names
// Based on the analysis output
const branchMappings = [
  { oldBranch: 'CSE(AI)', newBranch: 'DCSE(AI)', course: 'Diploma' },
  { oldBranch: 'CSE', newBranch: 'DCSE', course: 'Diploma' },
  { oldBranch: 'ECE', newBranch: 'DECE', course: 'Diploma' },
  { oldBranch: 'MEC', newBranch: 'DMEC', course: 'Diploma' },
];

async function fixOrphanedBranches() {
  console.log('='.repeat(60));
  console.log('Fix Orphaned Branches Script');
  console.log('='.repeat(60));

  try {
    // First, let's see what active branches exist for Diploma
    console.log('\n📋 Active branches for Diploma course:\n');
    
    const [activeBranches] = await masterPool.query(`
      SELECT cb.name, cb.is_active, c.name as course_name
      FROM course_branches cb
      JOIN courses c ON cb.course_id = c.id
      WHERE c.name = 'Diploma' AND cb.is_active = 1
      ORDER BY cb.name
    `);
    
    if (activeBranches.length === 0) {
      console.log('❌ No active branches found for Diploma course!');
      console.log('   Please check Settings > Colleges & Courses and ensure branches are created.');
    } else {
      console.log('Active branches:');
      activeBranches.forEach(b => console.log(`   ✅ ${b.name}`));
    }

    // Show current orphaned data
    console.log('\n📊 Current orphaned branches in student data:\n');
    
    const [orphaned] = await masterPool.query(`
      SELECT s.branch, s.course, COUNT(*) as student_count
      FROM students s LEFT JOIN colleges ON s.college_id = colleges.id LEFT JOIN courses ON s.course_id = courses.id LEFT JOIN course_branches ON s.branch_id = course_branches.id
      LEFT JOIN courses c ON s.course = c.name AND c.is_active = 1
      LEFT JOIN course_branches cb ON s.branch = cb.name AND cb.course_id = c.id AND cb.is_active = 1
      WHERE s.course = 'Diploma' 
        AND s.branch IS NOT NULL 
        AND s.branch != ''
        AND cb.id IS NULL
      GROUP BY s.branch, s.course
      ORDER BY student_count DESC
    `);

    if (orphaned.length === 0) {
      console.log('✅ No orphaned branches found! All student data is in sync.');
      await masterPool.end();
      process.exit(0);
    }

    console.log('Orphaned branches found:');
    orphaned.forEach(o => console.log(`   ⚠️  "${o.branch}" (${o.student_count} students)`));

    // Ask for confirmation
    console.log('\n' + '='.repeat(60));
    console.log('RECOMMENDED FIXES');
    console.log('='.repeat(60));
    
    // Create a map of active branch names for matching
    const activeBranchNames = activeBranches.map(b => b.name);
    
    console.log('\nBased on active branches, here are the recommended updates:\n');
    
    const fixes = [];
    
    for (const o of orphaned) {
      // Try to find a matching active branch
      let matchedBranch = null;
      
      // Direct prefix match (CSE -> DCSE)
      const prefixMatch = activeBranchNames.find(ab => 
        ab.toLowerCase() === 'd' + o.branch.toLowerCase() ||
        ab.toLowerCase().replace(/[^a-z]/g, '') === o.branch.toLowerCase().replace(/[^a-z]/g, '')
      );
      
      if (prefixMatch) {
        matchedBranch = prefixMatch;
      } else {
        // Try substring match
        const substringMatch = activeBranchNames.find(ab => 
          ab.toLowerCase().includes(o.branch.toLowerCase().substring(0, 3)) ||
          o.branch.toLowerCase().includes(ab.toLowerCase().substring(1, 4))
        );
        if (substringMatch) {
          matchedBranch = substringMatch;
        }
      }

      if (matchedBranch) {
        fixes.push({
          oldBranch: o.branch,
          newBranch: matchedBranch,
          course: o.course,
          studentCount: o.student_count
        });
        console.log(`   "${o.branch}" → "${matchedBranch}" (${o.student_count} students)`);
      } else {
        console.log(`   ❓ "${o.branch}" → No automatic match found. Manual mapping required.`);
        console.log(`      Available branches: ${activeBranchNames.join(', ')}`);
      }
    }

    if (fixes.length === 0) {
      console.log('\n❌ No automatic fixes could be determined.');
      console.log('   Please update the branchMappings in this script manually.');
      await masterPool.end();
      process.exit(1);
    }

    // Apply fixes
    console.log('\n' + '='.repeat(60));
    console.log('APPLYING FIXES...');
    console.log('='.repeat(60) + '\n');

    let totalUpdated = 0;

    for (const fix of fixes) {
      const [result] = await masterPool.query(
        `UPDATE students 
         SET branch = ?, updated_at = CURRENT_TIMESTAMP 
         WHERE branch = ? AND course = ?`,
        [fix.newBranch, fix.oldBranch, fix.course]
      );
      
      console.log(`✅ Updated ${result.affectedRows} students: "${fix.oldBranch}" → "${fix.newBranch}"`);
      totalUpdated += result.affectedRows;
    }

    console.log('\n' + '='.repeat(60));
    console.log(`COMPLETE: ${totalUpdated} student records updated.`);
    console.log('='.repeat(60));

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await masterPool.end();
    process.exit(0);
  }
}

fixOrphanedBranches();

