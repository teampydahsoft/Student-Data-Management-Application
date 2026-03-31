const { masterPool } = require('../config/database');

const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3; // Earth radius in meters
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const dphi = ((lat2 - lat1) * Math.PI) / 180;
    const dlambda = ((lon2 - lon1) * Math.PI) / 180;

    const a = Math.sin(dphi / 2) ** 2 +
        Math.cos(phi1) * Math.cos(phi2) *
        Math.sin(dlambda / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; 
};

/**
 * This script fixes internship assignments and attendance records based on physical coordinates.
 * Use case: Admin assigned students to Location A, but they physically went to Location B (or Loc B was wrong).
 */
async function finalFix() {
    console.log('--- Final Internship Data Correction starting ---');
    const connection = await masterPool.getConnection();
    
    try {
        await connection.beginTransaction();

        // 1. Get all locations
        const [locations] = await connection.query('SELECT * FROM internship_locations');
        console.log(`Loaded ${locations.length} locations.`);

        // 2. Find attendance records that have coordinates but are NOT 'Present'
        const [atts] = await connection.query(`
            SELECT id, student_id, internship_id, check_in_location, status 
            FROM internship_attendance 
            WHERE status != 'Present' AND check_in_location IS NOT NULL
        `);
        console.log(`Found ${atts.length} records to potentially fix.`);

        let fixedAssignments = 0;
        let fixedAttendance = 0;

        for (const att of atts) {
            let locData;
            try {
                locData = typeof att.check_in_location === 'string' ? JSON.parse(att.check_in_location) : att.check_in_location;
            } catch (e) { continue; }
            if (!locData || !locData.latitude) continue;

            // Check if they are actually near ANY location
            let correctLocation = null;
            for (const l of locations) {
                const dist = calculateDistance(locData.latitude, locData.longitude, parseFloat(l.latitude), parseFloat(l.longitude));
                if (dist <= l.radius) {
                    correctLocation = l;
                    break;
                }
            }

            if (correctLocation) {
                // We found the correct location! 
                // Now fix the assignment for this student
                const [asgnResult] = await connection.query(
                    'UPDATE internship_assignments SET internship_id = ? WHERE student_id = ? AND internship_id = ?',
                    [correctLocation.id, att.student_id, att.internship_id]
                );
                
                if (asgnResult.affectedRows > 0) {
                    fixedAssignments += asgnResult.affectedRows;
                }

                // Update the attendance record
                locData.distanceFromSite = calculateDistance(locData.latitude, locData.longitude, parseFloat(correctLocation.latitude), parseFloat(correctLocation.longitude));
                
                await connection.query(`
                    UPDATE internship_attendance 
                    SET status = 'Present', 
                        internship_id = ?, 
                        check_in_location = ?,
                        is_suspicious = 0,
                        suspicious_reason = NULL
                    WHERE id = ?
                `, [correctLocation.id, JSON.stringify(locData), att.id]);
                
                fixedAttendance++;
            }
        }

        await connection.commit();
        console.log(`--- Finished ---`);
        console.log(`Assignments fixed: ${fixedAssignments}`);
        console.log(`Attendance records fixed to 'Present': ${fixedAttendance}`);

    } catch (err) {
        await connection.rollback();
        console.error('CRITICAL ERROR:', err);
    } finally {
        connection.release();
        process.exit();
    }
}

finalFix();
