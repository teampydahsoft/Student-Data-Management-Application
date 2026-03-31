const { masterPool } = require('../config/database');

/**
 * Haversine formula to calculate distance between two points in meters
 */
const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3; // Earth radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; 
};

const fmtDate = (d) => {
    if (!d) return null;
    if (typeof d === 'string') return d.split('T')[0];
    return d.toISOString().split('T')[0];
};

async function fixInternshipMismatch() {
    console.log('--- Starting Internship Attendance Correction Script ---');
    const connection = await masterPool.getConnection();
    
    try {
        // 1. Fetch all internship locations for lookups
        const [locations] = await connection.query('SELECT * FROM internship_locations');
        const locationMap = new Map(locations.map(l => [l.id, l]));
        console.log(`Loaded ${locations.length} internship locations.`);

        // 2. Fetch all student assignments
        const [assignments] = await connection.query(`
            SELECT student_id, internship_id, start_date, end_date 
            FROM internship_assignments
        `);
        console.log(`Loaded ${assignments.length} student assignments.`);

        // 3. Fetch all attendance records that are NOT manual
        // Focus on records that are 'Absent', 'Rejected', or have empty status (as seen in earlier check)
        const [attendanceRecords] = await connection.query(`
            SELECT * FROM internship_attendance 
            WHERE is_manual = 0
            ORDER BY attendance_date DESC
        `);
        console.log(`Loaded ${attendanceRecords.length} attendance records to verify.`);

        let updatedCount = 0;
        let presentCount = 0;
        let errorCount = 0;

        for (const record of attendanceRecords) {
            const attDate = fmtDate(record.attendance_date);
            
            // Find the correct assignment for this student on this date
            const activeAssignment = assignments.find(asgn => 
                asgn.student_id === record.student_id && 
                attDate >= fmtDate(asgn.start_date) && 
                attDate <= fmtDate(asgn.end_date)
            );

            if (!activeAssignment) {
                // If no assignment found for this date, we skip or mark as Absent/Suspicious
                // console.log(`No assignment found for student ${record.student_id} on ${attDate}`);
                continue;
            }

            const location = locationMap.get(activeAssignment.internship_id);
            if (!location) continue;

            const targetLat = parseFloat(location.latitude);
            const targetLng = parseFloat(location.longitude);
            const targetRadius = parseInt(location.radius);

            let checkInLocData = null;
            try {
                checkInLocData = typeof record.check_in_location === 'string' ? JSON.parse(record.check_in_location) : record.check_in_location;
            } catch (e) { }

            if (checkInLocData && checkInLocData.latitude && checkInLocData.longitude) {
                // Re-calculate check-in distance
                const newInDist = calculateDistance(checkInLocData.latitude, checkInLocData.longitude, targetLat, targetLng);
                checkInLocData.distanceFromSite = newInInDist = newInDist;

                let checkOutLocData = null;
                if (record.check_out_location) {
                    try {
                        checkOutLocData = typeof record.check_out_location === 'string' ? JSON.parse(record.check_out_location) : record.check_out_location;
                        if (checkOutLocData.latitude && checkOutLocData.longitude) {
                            const outDist = calculateDistance(checkOutLocData.latitude, checkOutLocData.longitude, targetLat, targetLng);
                            checkOutLocData.distanceFromSite = outDist;
                        }
                    } catch (e) { }
                }

                // Determine Status
                let isSuspicious = record.accuracy > 500;
                let suspiciousReason = isSuspicious ? `Low Accuracy (${Math.round(record.accuracy)}m)` : null;

                let finalStatus = 'Present';
                if (newInDist > targetRadius) {
                    finalStatus = 'Absent';
                    isSuspicious = true;
                    suspiciousReason = (suspiciousReason ? suspiciousReason + " | " : "") + `Outside Radius: ${Math.round(newInDist)}m (Target: ${targetRadius}m)`;
                }

                if (checkOutLocData && checkOutLocData.distanceFromSite > targetRadius) {
                    finalStatus = 'Absent';
                    isSuspicious = true;
                    suspiciousReason = (suspiciousReason ? suspiciousReason + " | " : "") + `Outside Radius at Checkout: ${Math.round(checkOutLocData.distanceFromSite)}m`;
                }

                // If status changed or ID changed, update
                if (finalStatus !== record.status || activeAssignment.internship_id !== record.internship_id) {
                    await connection.query(`
                        UPDATE internship_attendance 
                        SET internship_id = ?, 
                            check_in_location = ?, 
                            check_out_location = ?,
                            status = ?,
                            is_suspicious = ?,
                            suspicious_reason = ?
                        WHERE id = ?
                    `, [
                        activeAssignment.internship_id,
                        JSON.stringify(checkInLocData),
                        checkOutLocData ? JSON.stringify(checkOutLocData) : record.check_out_location,
                        finalStatus,
                        isSuspicious ? 1 : 0,
                        suspiciousReason || record.suspicious_reason,
                        record.id
                    ]);
                    
                    updatedCount++;
                    if (finalStatus === 'Present') presentCount++;
                }
            } else {
                // If record has no location data but student has an assignment, just ensure internship_id is correct
                if (activeAssignment.internship_id !== record.internship_id) {
                    await connection.query('UPDATE internship_attendance SET internship_id = ? WHERE id = ?', [activeAssignment.internship_id, record.id]);
                    updatedCount++;
                }
            }
        }

        console.log(`--- Correction Completed ---`);
        console.log(`Total Records Updated: ${updatedCount}`);
        console.log(`Records flipped to 'Present': ${presentCount}`);

    } catch (err) {
        console.error('Error in fix script:', err);
    } finally {
        connection.release();
        process.exit();
    }
}

fixInternshipMismatch();
