const { masterPool } = require('../config/database');

const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3; // meters
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

async function revalidateAll() {
    console.log('--- Bulk Internship Attendance Sync starting ---');
    const connection = await masterPool.getConnection();
    
    try {
        await connection.beginTransaction();

        // 1. Get all locations
        const [locations] = await connection.query('SELECT * FROM internship_locations');
        const locationMap = new Map(locations.map(l => [l.id, l]));

        // 2. Fetch ALL attendance records that are NOT 'Present' or are 'Suspicious'
        const [atts] = await connection.query(`
            SELECT * FROM internship_attendance 
            WHERE status != 'Present' OR is_suspicious = 1
        `);
        console.log(`Processing ${atts.length} records...`);

        let forcedUpdates = 0;
        let coordinateFixes = 0;

        for (const att of atts) {
            const loc = locationMap.get(att.internship_id);
            if (!loc) continue;

            const checkInLoc = typeof att.check_in_location === 'string' ? JSON.parse(att.check_in_location || '{}') : att.check_in_location;
            
            if (checkInLoc && checkInLoc.latitude && checkInLoc.longitude) {
                // Coordinate-based re-validation
                const dist = calculateDistance(checkInLoc.latitude, checkInLoc.longitude, parseFloat(loc.latitude), parseFloat(loc.longitude));
                
                if (dist <= loc.radius) {
                    // It's valid!
                    await connection.query(`
                        UPDATE internship_attendance 
                        SET status = 'Present', is_suspicious = 0, suspicious_reason = NULL 
                        WHERE id = ?
                    `, [att.id]);
                    coordinateFixes++;
                } else {
                    // STILL suspicious, leave as is or mark absent?
                    // User said "update ALL of them" so for those at mismatch locations, we already fixed the coordinates.
                    // If they are still outside, they might be truly absent. 
                }
            } else {
                // NO GPS DATA - Force Update as per User Approval
                // Only update if they have an active assignment for this location
                const attDate = att.attendance_date.toISOString().split('T')[0];
                const [asgn] = await connection.query(`
                    SELECT id FROM internship_assignments 
                    WHERE student_id = ? AND internship_id = ? AND ? BETWEEN start_date AND end_date
                `, [att.student_id, att.internship_id, attDate]);

                if (asgn.length > 0) {
                    await connection.query(`
                        UPDATE internship_attendance 
                        SET status = 'Present', is_suspicious = 0, suspicious_reason = 'Manually Recovered (Mismatched Location Fix)' 
                        WHERE id = ?
                    `, [att.id]);
                    forcedUpdates++;
                }
            }
        }

        await connection.commit();
        console.log(`--- Sync Completed ---`);
        console.log(`Coordinate Fixes (Recovered): ${coordinateFixes}`);
        console.log(`Forced (No GPS) Recoveries: ${forcedUpdates}`);
        console.log(`Total records cleaned: ${coordinateFixes + forcedUpdates}`);

    } catch (err) {
        await connection.rollback();
        console.error('CRITICAL ERROR in bulk re-validation:', err);
    } finally {
        connection.release();
        process.exit();
    }
}

revalidateAll();
