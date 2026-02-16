const { masterPool } = require('../config/database');
const { validationResult } = require('express-validator');

// Haversine formula to calculate distance between two points in meters
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

    return R * c; // Distance in meters
};

// --- Admin Controllers ---

exports.createInternship = async (req, res) => {
    console.log('Admin creating internship location:', req.body);
    try {
        const { companyName, address, latitude, longitude, radius, allowedStartTime, allowedEndTime } = req.body;

        // Basic validation
        if (!companyName || !address || !latitude || !longitude || !allowedStartTime || !allowedEndTime) {
            console.warn('Missing fields in createInternship request');
            return res.status(400).json({ success: false, message: 'All fields are required.' });
        }

        const [result] = await masterPool.query(
            `INSERT INTO internship_locations 
            (company_name, address, latitude, longitude, radius, allowed_start_time, allowed_end_time) 
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [companyName, address, latitude, longitude, radius || 200, allowedStartTime, allowedEndTime]
        );

        console.log('Internship location created with ID:', result.insertId);

        const [rows] = await masterPool.query('SELECT * FROM internship_locations WHERE id = ?', [result.insertId]);

        res.status(201).json({ success: true, data: rows[0], message: 'Internship location created successfully.' });
    } catch (error) {
        console.error('Error creating internship:', error);
        res.status(500).json({ success: false, message: 'Server error while creating internship.' });
    }
};

exports.getInternships = async (req, res) => {
    console.log('Fetching all active internship locations');
    try {
        const [rows] = await masterPool.query('SELECT * FROM internship_locations WHERE is_active = 1');
        // Map to camelCase for frontend consistency if needed
        const locations = rows.map(loc => ({
            _id: loc.id,
            companyName: loc.company_name,
            address: loc.address,
            latitude: parseFloat(loc.latitude),
            longitude: parseFloat(loc.longitude),
            radius: loc.radius,
            allowedStartTime: loc.allowed_start_time,
            allowedEndTime: loc.allowed_end_time,
            isActive: loc.is_active,
            createdAt: loc.created_at
        }));
        console.log(`Fetched ${locations.length} internship locations`);
        res.json({ success: true, data: locations });
    } catch (error) {
        console.error('Error fetching internships:', error);
        res.status(500).json({ success: false, message: 'Server error while fetching internships.' });
    }
};

exports.updateInternshipLocation = async (req, res) => {
    console.log('Updating internship location:', req.params.id, req.body);
    try {
        const { id } = req.params;
        const { companyName, address, latitude, longitude, radius, allowedStartTime, allowedEndTime, isActive } = req.body;

        await masterPool.query(`
            UPDATE internship_locations 
            SET company_name = ?, address = ?, latitude = ?, longitude = ?, radius = ?, 
                allowed_start_time = ?, allowed_end_time = ?, is_active = ?
            WHERE id = ?
        `, [
            companyName, address, latitude, longitude, radius,
            allowedStartTime, allowedEndTime, isActive !== undefined ? isActive : 1,
            id
        ]);

        res.json({ success: true, message: 'Internship location updated successfully.' });
    } catch (error) {
        console.error('Error updating internship location:', error);
        res.status(500).json({ success: false, message: 'Server error while updating location.' });
    }
};

exports.getAttendanceReport = async (req, res) => {
    console.log('Fetching internship attendance report with filters:', req.query);
    try {
        const { batch, college, course, branch, year, semester } = req.query;

        // Fetch students and LEFT JOIN attendance for TODAY (or recent/all)
        // Usually report shows presence/absence for today if context is "Current Attendance"
        // Or history? Given the filters are meant to "select students", let's show Today's status for the filtered group.

        let query = `
            SELECT 
                s.id AS student_db_id,
                s.student_name,
                s.admission_number,
                s.batch,
                s.course,
                s.branch,
                s.current_year,
                s.current_semester,
                ia.id AS attendance_id,
                ia.check_in_time,
                ia.check_out_time,
                ia.check_in_location,
                ia.check_out_location,
                ia.status,
                ia.is_suspicious,
                ia.suspicious_reason,
                ia.attendance_date,
                il.company_name,
                il.address,
                il_assigned.company_name AS assigned_company_name,
                il_assigned.address AS assigned_address
            FROM students s
            LEFT JOIN internship_attendance ia 
                ON s.id = ia.student_id 
                AND ia.attendance_date = CURDATE()
            LEFT JOIN internship_locations il 
                ON ia.internship_id = il.id
            LEFT JOIN internship_assignments i_assign
                ON s.id = i_assign.student_id
                AND CURDATE() BETWEEN i_assign.start_date AND i_assign.end_date
            LEFT JOIN internship_locations il_assigned
                ON i_assign.internship_id = il_assigned.id
            WHERE 1=1 AND s.student_status = 'Regular'
        `;

        const params = [];

        // Apply filters dynamically
        if (batch) {
            query += ' AND s.batch = ?';
            params.push(batch);
        }
        if (college) {
            query += ' AND s.college = ?';
            params.push(college);
        }
        if (course) {
            query += ' AND s.course = ?';
            params.push(course);
        }
        if (branch) {
            query += ' AND s.branch = ?';
            params.push(branch);
        }
        if (year) {
            query += ' AND s.current_year = ?';
            params.push(year);
        }
        if (semester) {
            query += ' AND s.current_semester = ?';
            params.push(semester);
        }

        // Show attended first, then alphabetically
        query += ' ORDER BY ia.check_in_time DESC, s.admission_number ASC LIMIT 100';

        const [rows] = await masterPool.query(query, params);

        console.log(`Report query returned ${rows.length} records`);

        // Map simple structure
        const reportData = rows.map(row => ({
            _id: row.attendance_id || `temp-${row.student_db_id}`, // temporary ID if not marked
            studentId: row.admission_number,
            internshipId: row.company_name ? {
                companyName: row.company_name,
                address: row.address
            } : (row.assigned_company_name ? {
                companyName: row.assigned_company_name,
                address: row.assigned_address
            } : null),
            studentDetails: {
                name: row.student_name,
                batch: row.batch,
                course: row.course,
                branch: row.branch,
                year: row.current_year,
                semester: row.current_semester
            },
            checkInTime: row.check_in_time,
            checkOutTime: row.check_out_time,
            checkInLocation: row.check_in_location ? (() => {
                try {
                    const loc = JSON.parse(row.check_in_location);
                    delete loc.image; // Remove image for list view
                    return loc;
                } catch (e) { return null; }
            })() : null,
            checkOutLocation: row.check_out_location ? (() => {
                try {
                    const loc = JSON.parse(row.check_out_location);
                    delete loc.image; // Remove image for list view
                    return loc;
                } catch (e) { return null; }
            })() : null,
            status: row.status || 'Not Marked',
            isSuspicious: row.is_suspicious,
            suspiciousReason: row.suspicious_reason,
            date: row.attendance_date || new Date().toISOString()
        }));

        res.json({ success: true, data: reportData });
    } catch (error) {
        console.error('Error fetching attendance report:', error);
        res.status(500).json({ success: false, message: 'Server error while fetching report.' });
    }
};

exports.getAttendanceDetails = async (req, res) => {
    try {
        const { id } = req.params;
        // id can be 'temp-studentID' or actual attendance ID
        if (id.startsWith('temp-')) {
            return res.status(404).json({ success: false, message: 'No attendance record found for this student.' });
        }

        const [rows] = await masterPool.query(
            `SELECT ia.*, s.student_name, s.admission_number, il.company_name, il.address, il.latitude, il.longitude
             FROM internship_attendance ia
             JOIN students s ON ia.student_id = s.id
             LEFT JOIN internship_locations il ON ia.internship_id = il.id
             WHERE ia.id = ?`,
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Attendance record not found.' });
        }

        const row = rows[0];
        const data = {
            ...row,
            checkInTime: row.check_in_time,
            checkOutTime: row.check_out_time,
            checkInLocation: row.check_in_location, // Full JSON with image
            checkOutLocation: row.check_out_location, // Full JSON with image
            internshipId: {
                companyName: row.company_name,
                address: row.address,
                latitude: row.latitude,
                longitude: row.longitude
            }
        };

        res.json({ success: true, data });
    } catch (error) {
        console.error('Error fetching attendance details:', error);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
};

exports.assignInternship = async (req, res) => {
    console.log('Assigning internship with filters:', req.body);
    try {
        const { internshipId, startDate, endDate, allowedDays, filters, studentIds } = req.body;
        // filters: batch, college, course, branch, year, semester

        if (!internshipId || !startDate || !endDate || !allowedDays) {
            return res.status(400).json({ success: false, message: 'Internship, Start Date, End Date, and Allowed Days are required.' });
        }

        let students = [];

        // 1. Find eligible students
        if (studentIds && Array.isArray(studentIds) && studentIds.length > 0) {
            // Provided IDs are likely admission numbers or pin numbers (strings)
            // Query to find their internal IDs.
            // Note: studentIds array is used twice for both columns.
            const [rows] = await masterPool.query(
                'SELECT id FROM students WHERE admission_number IN (?) OR pin_no IN (?)',
                [studentIds, studentIds]
            );
            students = rows; // rows contains objects like { id: 123 }
        } else {
            // Use filters (this query already selects internal ID)
            let query = `SELECT id FROM students WHERE 1=1 AND student_status = 'Regular'`;
            const params = [];

            if (filters) {
                if (filters.batch) { query += ' AND batch = ?'; params.push(filters.batch); }
                if (filters.college) { query += ' AND college = ?'; params.push(filters.college); }
                if (filters.course) { query += ' AND course = ?'; params.push(filters.course); }
                if (filters.branch) { query += ' AND branch = ?'; params.push(filters.branch); }
                if (filters.year) { query += ' AND current_year = ?'; params.push(filters.year); }
                if (filters.semester) { query += ' AND current_semester = ?'; params.push(filters.semester); }
            }

            const [rows] = await masterPool.query(query, params);
            students = rows;
        }

        if (students.length === 0) {
            return res.status(404).json({ success: false, message: 'No valid students found matching the selection.' });
        }

        console.log(`Found ${students.length} students to assign.`);

        // 2. Prepare bulk insert
        // allowedDays should be JSON string
        const allowedDaysStr = JSON.stringify(allowedDays);
        const values = students.map(s => [
            s.id, internshipId, startDate, endDate, allowedDaysStr
        ]);

        if (values.length > 0) {
            const sql = `INSERT INTO internship_assignments (student_id, internship_id, start_date, end_date, allowed_days) VALUES ?`;
            await masterPool.query(sql, [values]);
        }

        res.json({
            success: true,
            message: `Successfully assigned internship to ${students.length} students.`
        });

    } catch (error) {
        console.error('Error assigning internship:', error);
        res.status(500).json({ success: false, message: 'Server error while assigning internship.' });
    }
};

exports.getAssignedStudents = async (req, res) => {
    try {
        const { id } = req.params; // internshipId

        const [rows] = await masterPool.query(`
            SELECT 
                ia.id AS assignment_id,
                s.student_name, 
                s.admission_number, 
                s.batch, 
                s.course, 
                s.branch, 
                s.current_year, 
                s.current_semester,
                ia.start_date,
                ia.end_date,
                ia.allowed_days
            FROM internship_assignments ia
            JOIN students s ON ia.student_id = s.id
            WHERE ia.internship_id = ?
            ORDER BY s.student_name ASC
        `, [id]);

        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('Error fetching assigned students:', error);
        res.status(500).json({ success: false, message: 'Server error fetching students.' });
    }
};

exports.getStudentAssignment = async (req, res) => {
    try {
        const { query } = req.query; // admission_number or name
        if (!query) return res.status(400).json({ success: false, message: 'Query is required' });

        // prioritize admission number match
        const [students] = await masterPool.query(`
            SELECT id, student_name, admission_number, batch, branch, current_year, current_semester 
            FROM students 
            WHERE admission_number LIKE ? OR student_name LIKE ? 
            LIMIT 5
        `, [`%${query}%`, `%${query}%`]);

        if (students.length === 0) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }

        // For simplicity, if multiple, return list, but for now let's assume specific search or handle first
        // If exact match on admission_number, take that.
        let student = students.find(s => s.admission_number === query) || students[0];

        // Get Assignment
        const [assignments] = await masterPool.query(`
            SELECT ia.*, il.company_name, il.address 
            FROM internship_assignments ia
            JOIN internship_locations il ON ia.internship_id = il.id
            WHERE ia.student_id = ?
        `, [student.id]);

        res.json({
            success: true,
            student,
            assignment: assignments[0] || null,
            alternatives: students.length > 1 ? students : []
        });

    } catch (error) {
        console.error('Error fetching student assignment:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.updateStudentAssignment = async (req, res) => {
    try {
        const { assignmentId, internshipId, startDate, endDate, allowedDays } = req.body;

        await masterPool.query(`
            UPDATE internship_assignments 
            SET internship_id = ?, start_date = ?, end_date = ?, allowed_days = ?
            WHERE id = ?
        `, [internshipId, startDate, endDate, JSON.stringify(allowedDays), assignmentId]);

        res.json({ success: true, message: 'Assignment updated successfully' });
    } catch (error) {
        console.error('Error updating assignment:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.removeStudentAssignment = async (req, res) => {
    try {
        const { assignmentId } = req.params;
        await masterPool.query('DELETE FROM internship_assignments WHERE id = ?', [assignmentId]);
        res.json({ success: true, message: 'Assignment removed successfully' });
    } catch (error) {
        console.error('Error removing assignment:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// --- Student Controllers ---

exports.markAttendance = async (req, res) => {
    console.log(`Student ${req.user.id} marking attendance:`, req.body);
    try {
        const { internshipId, latitude, longitude, accuracy, image, deviceFingerprint } = req.body;
        const studentId = req.user.id;
        const ipAddress = req.ip || req.connection.remoteAddress;

        if (!internshipId || !latitude || !longitude || !accuracy) {
            console.warn('Incomplete location data for markAttendance');
            return res.status(400).json({ success: false, message: 'Location data is incomplete.' });
        }

        let isSuspicious = false;
        let suspiciousReason = null;

        // 1. Accuracy Check (Relaxed to 500m based on user feedback)
        if (accuracy > 500) {
            if (image) {
                isSuspicious = true;
                suspiciousReason = `Low Accuracy (${Math.round(accuracy)}m). Photo Verified.`;
                console.log(`Student ${studentId} low accuracy overridden by photo verification.`);
            } else {
                return res.status(400).json({
                    success: false,
                    message: `GPS Signal is weak (${Math.round(accuracy)}m accuracy). Please verify with a photo.`,
                    requiresPhoto: true
                });
            }
        }

        // Fetch Internship details
        const [internships] = await masterPool.query('SELECT * FROM internship_locations WHERE id = ?', [internshipId]);
        if (internships.length === 0) {
            return res.status(404).json({ success: false, message: 'Internship location not found.' });
        }
        const internship = internships[0];

        // 2. Distance Calculation
        const distance = calculateDistance(latitude, longitude, parseFloat(internship.latitude), parseFloat(internship.longitude));
        console.log(`Distance for student ${studentId}: ${distance}m (Allowed: ${internship.radius}m)`);

        // 3. Radius Check (Allow but Mark as Suspicious)
        if (!isSuspicious && distance > internship.radius) {
            isSuspicious = true;
            suspiciousReason = `Outside Radius: ${Math.round(distance)}m (Allowed: ${internship.radius}m)`;
            console.log(`Student ${studentId} is outside radius but attendance recorded as Suspicious.`);
        }

        // 4. Time Check
        const now = new Date();
        const currentHour = now.getHours().toString().padStart(2, '0');
        const currentMinute = now.getMinutes().toString().padStart(2, '0');
        const currentTimeStr = `${currentHour}:${currentMinute}`;

        if (currentTimeStr < internship.allowed_start_time || currentTimeStr > internship.allowed_end_time) {
            console.warn(`Attendance attempt outside hours: ${currentTimeStr}`);
            return res.status(400).json({
                success: false,
                message: `Attendance is only allowed between ${internship.allowed_start_time} and ${internship.allowed_end_time}.`
            });
        }

        // 5. Check-In/Check-out Logic
        const today = new Date().toISOString().split('T')[0];

        // DEVICE FINGERPRINT CHECK
        if (deviceFingerprint) {
            const [duplicates] = await masterPool.query(
                `SELECT student_id FROM internship_attendance 
                 WHERE device_fingerprint = ? AND attendance_date = ? AND student_id != ?`,
                [deviceFingerprint, today, studentId]
            );
            if (duplicates.length > 0) {
                isSuspicious = true;
                suspiciousReason = suspiciousReason
                    ? suspiciousReason + " | Proxy Suspected (Device Shared)"
                    : `Proxy Suspected: Device used by another student (${duplicates[0].student_id})`;
                console.warn(`Suspicious: Device fingerprint ${deviceFingerprint} used by multiple students today.`);
            }
        }

        const [existing] = await masterPool.query(
            'SELECT * FROM internship_attendance WHERE student_id = ? AND internship_id = ? AND attendance_date = ?',
            [studentId, internshipId, today]
        );

        let attendance = existing[0];

        if (attendance) {
            // Check-out
            if (!attendance.check_out_time) {
                const checkOutLocation = JSON.stringify({
                    latitude,
                    longitude,
                    accuracy,
                    distanceFromSite: distance,
                    ipAddress,
                    photoVerified: !!image, // Mark as verified
                    // image: imageVal // Omitted to save storage as per request
                });

                await masterPool.query(
                    `UPDATE internship_attendance 
                     SET check_out_time = NOW(), check_out_location = ?, status = 'Present' 
                     WHERE id = ?`,
                    [checkOutLocation, attendance.id]
                );

                console.log(`Student ${studentId} checked out successfully.`);
                const [updated] = await masterPool.query('SELECT * FROM internship_attendance WHERE id = ?', [attendance.id]);
                const mappedUpdated = {
                    ...updated[0],
                    checkInTime: updated[0].check_in_time,
                    checkOutTime: updated[0].check_out_time
                };
                return res.json({ success: true, message: 'Check-out successful.', type: 'CHECK_OUT', data: mappedUpdated });
            } else {
                return res.status(400).json({ success: false, message: 'You have already completed attendance for today.' });
            }
        } else {


            // Check-in
            const checkInLocation = JSON.stringify({
                latitude,
                longitude,
                accuracy,
                distanceFromSite: distance,
                ipAddress,
                photoVerified: !!image, // Mark as verified
                // image: imageVal // Omitted to save storage as per request
            });

            // REJECTION LOGIC: If too far (e.g. > 2000m buffer), mark as Rejected immediately
            if (distance > internship.radius + 2000) {
                const [result] = await masterPool.query(
                    `INSERT INTO internship_attendance 
                    (student_id, internship_id, check_in_time, check_in_location, status, attendance_date, is_suspicious, suspicious_reason, device_fingerprint) 
                    VALUES (?, ?, NOW(), ?, 'Rejected', ?, 1, ?, ?)`,
                    [studentId, internshipId, checkInLocation, today, `Extreme Distance: ${Math.round(distance)}m`, deviceFingerprint]
                );
                console.log(`Student ${studentId} marked as REJECTED due to extreme distance.`);
                const [newAttendance] = await masterPool.query('SELECT * FROM internship_attendance WHERE id = ?', [result.insertId]);
                const mappedNew = {
                    ...newAttendance[0],
                    checkInTime: newAttendance[0].check_in_time,
                    checkOutTime: newAttendance[0].check_out_time
                };
                return res.json({ success: true, message: 'You are too far from the location. Attendance marked as Rejected.', type: 'REJECTED', data: mappedNew });
            }

            const [result] = await masterPool.query(
                `INSERT INTO internship_attendance 
                (student_id, internship_id, check_in_time, check_in_location, status, attendance_date, is_suspicious, suspicious_reason, device_fingerprint) 
                VALUES (?, ?, NOW(), ?, 'Present', ?, ?, ?, ?)`,
                [studentId, internshipId, checkInLocation, today, isSuspicious, suspiciousReason, deviceFingerprint]
            );

            console.log(`Student ${studentId} checked in successfully. ID: ${result.insertId}`);
            const [newAttendance] = await masterPool.query('SELECT * FROM internship_attendance WHERE id = ?', [result.insertId]);
            const mappedNew = {
                ...newAttendance[0],
                checkInTime: newAttendance[0].check_in_time,
                checkOutTime: newAttendance[0].check_out_time
            };
            return res.json({ success: true, message: 'Check-in successful.', type: 'CHECK_IN', data: mappedNew });
        }

    } catch (error) {
        console.error('Error marking attendance:', error);
        res.status(500).json({ success: false, message: 'Server error while marking attendance.' });
    }
};

exports.getStudentStatus = async (req, res) => {
    try {
        const studentId = req.user.id;
        const today = new Date().toISOString().split('T')[0];

        const [rows] = await masterPool.query(`
            SELECT ia.*, il.company_name, il.address 
            FROM internship_attendance ia
            JOIN internship_locations il ON ia.internship_id = il.id
            WHERE ia.student_id = ? AND ia.attendance_date = ?
            LIMIT 1
        `, [studentId, today]);

        const attendance = rows[0];

        if (!attendance) {
            return res.json({ success: true, status: 'NOT_STARTED' });
        }

        const mappedAttendance = {
            ...attendance,
            checkInTime: attendance.check_in_time,
            checkOutTime: attendance.check_out_time,
            internshipId: {
                companyName: attendance.company_name,
                address: attendance.address
            }
        };

        if (attendance.check_in_time && !attendance.check_out_time) {
            return res.json({ success: true, status: 'CHECKED_IN', data: mappedAttendance });
        }

        if (attendance.check_in_time && attendance.check_out_time) {
            return res.json({ success: true, status: 'COMPLETED', data: mappedAttendance });
        }

        res.json({ success: true, status: 'UNKNOWN' });

    } catch (error) {
        console.error('Error getting student status:', error);
        res.status(500).json({ success: false, message: 'Error fetching status' });
    }
}

exports.getMyAssignment = async (req, res) => {
    try {
        const studentId = req.user.id;
        const [assignments] = await masterPool.query(`
            SELECT ia.*, il.company_name, il.address, il.latitude, il.longitude, il.radius
            FROM internship_assignments ia
            JOIN internship_locations il ON ia.internship_id = il.id
            WHERE ia.student_id = ?
            AND ia.end_date >= CURDATE()
            ORDER BY ia.start_date DESC
            LIMIT 1
        `, [studentId]);

        if (assignments.length === 0) {
            return res.json({ success: true, assignment: null });
        }

        res.json({ success: true, assignment: assignments[0] });
    } catch (error) {
        console.error('Error fetching my assignment:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};