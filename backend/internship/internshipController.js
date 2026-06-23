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

// IST Timezone Helpers (India Standard Time: UTC+5:30)
// Always derived from UTC epoch + fixed IST offset.
// Do NOT use getTimezoneOffset() — the server TZ (Asia/Kolkata) makes it -330,
// which cancels the offset and returns UTC instead of IST.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

const getCurrentISTTime = () => {
    // Add IST offset to UTC epoch, then read UTC fields to get IST wall clock time
    return new Date(Date.now() + IST_OFFSET_MS);
};

const getCurrentISTDayShort = () => {
    const istTime = getCurrentISTTime();
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return days[istTime.getUTCDay()];
};

const getCurrentISTDate = () => {
    const istTime = getCurrentISTTime();
    const year = istTime.getUTCFullYear();
    const month = String(istTime.getUTCMonth() + 1).padStart(2, '0');
    const day = String(istTime.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

// Helper: Re-validates attendance records against a (possibly new) internship location
const revalidateAttendanceInternal = async (connection, studentIdList, startDate, endDate, internshipId) => {
    if (!studentIdList || studentIdList.length === 0) return 0;

    // 1. Fetch target location details
    const [locRows] = await connection.query('SELECT latitude, longitude, radius FROM internship_locations WHERE id = ?', [internshipId]);
    const newLoc = locRows[0];

    if (!newLoc) {
        console.warn(`[Internship] Re-validation failed: Location ID ${internshipId} not found.`);
        return 0;
    }

    const targetLat = parseFloat(newLoc.latitude);
    const targetLng = parseFloat(newLoc.longitude);
    const targetRadius = parseInt(newLoc.radius);

    // 2. Fetch affected attendance records
    const [attendanceRecords] = await connection.query(`
        SELECT * FROM internship_attendance 
        WHERE student_id IN (?) 
        AND attendance_date BETWEEN ? AND ?
        AND is_manual = 0
    `, [studentIdList, startDate, endDate]);

    if (attendanceRecords.length === 0) return 0;

    console.log(`[Internship] Re-validating ${attendanceRecords.length} records against location ${newLoc.company_name} (radius ${targetRadius}m).`);

    let updatedCount = 0;
    for (const record of attendanceRecords) {
        let checkInLocData = null;
        try {
            checkInLocData = typeof record.check_in_location === 'string' ? JSON.parse(record.check_in_location) : record.check_in_location;
        } catch (e) { }

        if (checkInLocData && checkInLocData.latitude && checkInLocData.longitude) {
            // Calculate new distance for Check-In
            const newDistance = calculateDistance(checkInLocData.latitude, checkInLocData.longitude, targetLat, targetLng);
            checkInLocData.distanceFromSite = newDistance;

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

            // Determine status logic (consistency with markAttendance)
            let isSuspicious = record.accuracy > 500;
            let suspiciousReason = isSuspicious ? `Low Accuracy (${Math.round(record.accuracy)}m)` : null;

            let finalStatus = 'Present';
            if (newDistance > targetRadius) {
                finalStatus = 'Absent';
                isSuspicious = true;
                suspiciousReason = (suspiciousReason ? suspiciousReason + " | " : "") + `Outside Radius: ${Math.round(newDistance)}m (Target: ${targetRadius}m)`;
            }

            if (checkOutLocData && checkOutLocData.distanceFromSite > targetRadius) {
                finalStatus = 'Absent';
                isSuspicious = true;
                suspiciousReason = (suspiciousReason ? suspiciousReason + " | " : "") + `Outside Radius at Checkout: ${Math.round(checkOutLocData.distanceFromSite)}m`;
            }

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
                internshipId, 
                JSON.stringify(checkInLocData), 
                checkOutLocData ? JSON.stringify(checkOutLocData) : record.check_out_location,
                finalStatus,
                isSuspicious ? 1 : 0,
                suspiciousReason || record.suspicious_reason, // Keep existing if no new reason
                record.id
            ]);
            updatedCount++;
        } else {
            // Just update the ID if no location data (e.g. manual fallback)
            await connection.query('UPDATE internship_attendance SET internship_id = ? WHERE id = ?', [internshipId, record.id]);
            updatedCount++;
        }
    }
    return updatedCount;
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

        // Auto-revalidate attendance records for all students assigned here
        // (Since coordinates or radius might have changed)
        const connection = await masterPool.getConnection();
        try {
            // Find all active/future assignments for this location
            const [assignments] = await connection.query(
                'SELECT student_id, start_date, end_date FROM internship_assignments WHERE internship_id = ?',
                [id]
            );

            if (assignments.length > 0) {
                // Group by dates to handle range
                const minStart = assignments.reduce((min, a) => a.start_date < min ? a.start_date : min, assignments[0].start_date);
                const studentIds = assignments.map(a => a.student_id);
                
                await revalidateAttendanceInternal(connection, studentIds, minStart, getCurrentISTDate(), id);
            }
        } catch (err) {
            console.error('[Internship] Error during auto-revalidation:', err);
        } finally {
            connection.release();
        }

        res.json({ success: true, message: 'Internship location updated and attendance records re-validated successfully.' });
    } catch (error) {
        console.error('Error updating internship location:', error);
        res.status(500).json({ success: false, message: 'Server error while updating location.' });
    }
};

exports.getAttendanceReport = async (req, res) => {
    console.log('Fetching internship attendance report with filters:', req.query);
    try {
        const { batch, college, course, branch, year, semester, location, startDate, endDate } = req.query;
        
        // Use provided dates or default to today (IST)
        const reportStartDate = startDate || getCurrentISTDate();
        const reportEndDate = endDate || reportStartDate;

        // before generating report, mark any overdue students as absent for today
        if (!startDate || reportStartDate === getCurrentISTDate()) {
            await autoMarkAbsentees(reportStartDate);
        }

        // We'll use a slightly different query strategy to fix duplicates:
        // 1. Find valid assignments for the target date(s) that match the allowed_days
        // 2. Left join attendance records for those specific assignments/dates
        
        let query = `
            SELECT 
                s.id AS student_db_id, s.student_name, s.admission_number, s.batch, s.course, s.branch, s.current_year, s.current_semester,
                ia.id AS attendance_id, ia.check_in_time, ia.check_out_time, ia.check_in_location, ia.check_out_location, ia.status, ia.is_suspicious, ia.suspicious_reason, ia.attendance_date,
                il_assigned.company_name AS assigned_company_name, il_assigned.address AS assigned_address, il_assigned.allowed_end_time AS assigned_allowed_end_time
            FROM students s
            JOIN internship_assignments i_assign ON s.id = i_assign.student_id
            JOIN internship_locations il_assigned ON i_assign.internship_id = il_assigned.id
            LEFT JOIN internship_attendance ia 
                ON s.id = ia.student_id 
                AND ia.internship_id = i_assign.internship_id
                AND ia.attendance_date BETWEEN ? AND ?
                AND ia.attendance_date BETWEEN i_assign.start_date AND i_assign.end_date
            WHERE 1=1 
            AND s.student_status = 'Regular'
            AND (
                -- Case A: If report is for a range, we show all records within that range
                -- Case B: If single date, we strictly enforce it
                (ia.attendance_date IS NOT NULL) 
                OR 
                (? = ? AND ? BETWEEN i_assign.start_date AND i_assign.end_date 
                 AND JSON_CONTAINS(i_assign.allowed_days, JSON_QUOTE(LEFT(DAYNAME(?), 3))))
            )
        `;

        const params = [reportStartDate, reportEndDate, reportStartDate, reportEndDate, reportStartDate, reportStartDate];

        if (location) { query += ' AND i_assign.internship_id = ?'; params.push(location); }
        if (batch) { query += ' AND s.batch = ?'; params.push(batch); }
        if (college) { query += ' AND s.college = ?'; params.push(college); }
        if (course) { query += ' AND s.course = ?'; params.push(course); }
        if (branch) { query += ' AND s.branch = ?'; params.push(branch); }
        if (year) { query += ' AND s.current_year = ?'; params.push(year); }
        if (semester) { query += ' AND s.current_semester = ?'; params.push(semester); }

        query += ' ORDER BY ia.attendance_date DESC, ia.check_in_time DESC, s.admission_number ASC LIMIT 200';

        const [rows] = await masterPool.query(query, params);

        const reportData = rows.map(row => ({
            _id: row.attendance_id || `temp-${row.student_db_id}-${row.assigned_company_name}`,
            studentId: row.admission_number,
            internshipId: {
                companyName: row.assigned_company_name,
                address: row.assigned_address,
                allowedEndTime: row.assigned_allowed_end_time
            },
            studentDetails: {
                name: row.student_name, batch: row.batch, course: row.course, branch: row.branch, year: row.current_year, semester: row.current_semester
            },
            checkInTime: row.check_in_time,
            checkOutTime: row.check_out_time,
            checkInLocation: row.check_in_location ? (() => {
                try { const loc = JSON.parse(row.check_in_location); delete loc.image; return loc; } catch (e) { return null; }
            })() : null,
            checkOutLocation: row.check_out_location ? (() => {
                try { const loc = JSON.parse(row.check_out_location); delete loc.image; return loc; } catch (e) { return null; }
            })() : null,
            status: row.status || 'Not Marked',
            isSuspicious: row.is_suspicious,
            suspiciousReason: row.suspicious_reason,
            date: row.attendance_date || reportStartDate
        }));

        res.json({ success: true, data: reportData });
    } catch (error) {
        console.error('Error fetching attendance report:', error);
        res.status(500).json({ success: false, message: 'Server error while fetching report.' });
    }
};


exports.getDayEndReport = async (req, res) => {
    try {
        const { date, batch, college, course, branch, year, semester } = req.query;
        const reportDate = date || getCurrentISTDate();
        // automatically mark absentees for provided date as well
        await autoMarkAbsentees(reportDate);

        // Base query to get students with active internships (scheduled for THIS specific day) and their attendance
        let query = `
            SELECT 
                s.college,
                s.batch,
                s.course,
                s.branch,
                s.current_year AS year,
                s.current_semester AS semester,
                COUNT(s.id) AS total_students,
                SUM(CASE WHEN ia.status = 'Present' THEN 1 ELSE 0 END) AS present,
                SUM(CASE WHEN ia.status = 'Absent' THEN 1 ELSE 0 END) AS absent,
                SUM(CASE WHEN ia.status = 'Rejected' THEN 1 ELSE 0 END) AS rejected,
                MAX(COALESCE(ia.check_out_time, ia.check_in_time)) AS last_updated
            FROM students s
            JOIN internship_assignments i_assign
                ON s.id = i_assign.student_id
                AND ? BETWEEN i_assign.start_date AND i_assign.end_date
                AND JSON_CONTAINS(i_assign.allowed_days, JSON_QUOTE(LEFT(DAYNAME(?), 3)))
            LEFT JOIN internship_attendance ia 
                ON s.id = ia.student_id 
                AND ia.attendance_date = ?
                AND ia.internship_id = i_assign.internship_id
            WHERE s.student_status = 'Regular'
        `;

        const params = [reportDate, reportDate, reportDate];

        if (batch) { query += ' AND s.batch = ?'; params.push(batch); }
        if (college) { query += ' AND s.college = ?'; params.push(college); }
        if (course) { query += ' AND s.course = ?'; params.push(course); }
        if (branch) { query += ' AND s.branch = ?'; params.push(branch); }
        if (year) { query += ' AND s.current_year = ?'; params.push(year); }
        if (semester) { query += ' AND s.current_semester = ?'; params.push(semester); }

        query += `
            GROUP BY s.college, s.batch, s.course, s.branch, s.current_year, s.current_semester
            ORDER BY s.college, s.batch, s.course, s.branch, s.current_year, s.current_semester
        `;

        const [groupedRows] = await masterPool.query(query, params);

        // Calculate totals
        let totalStudents = 0;
        let presentToday = 0;
        let absentToday = 0;
        let rejectedToday = 0;
        let markedToday = 0;

        const groupedData = groupedRows.map(row => {
            const total = Number(row.total_students) || 0;
            const present = Number(row.present) || 0;
            const absent = Number(row.absent) || 0;
            const rejected = Number(row.rejected) || 0;
            const marked = present + absent + rejected;

            totalStudents += total;
            presentToday += present;
            absentToday += absent;
            rejectedToday += rejected;
            markedToday += marked;

            return {
                college: row.college || '—',
                batch: row.batch || '—',
                course: row.course || '—',
                branch: row.branch || '—',
                year: row.year || '—',
                semester: row.semester || '—',
                totalStudents: total,
                presentToday: present,
                absentToday: absent,
                rejectedToday: rejected,
                markedToday: marked,
                pendingToday: Math.max(0, total - marked),
                lastUpdated: row.last_updated || null
            };
        });

        const unmarkedToday = Math.max(0, totalStudents - markedToday);

        res.json({
            success: true,
            data: {
                totalStudents,
                presentToday,
                absentToday,
                rejectedToday,
                markedToday,
                unmarkedToday,
                holidayToday: 0, // Not implemented for internships yet
                date: reportDate,
                groupedSummary: groupedData
            }
        });

    } catch (error) {
        console.error('Error fetching day end report:', error);
        res.status(500).json({ success: false, message: 'Server error while fetching day end report.' });
    }
};

exports.downloadDayEndReport = async (req, res) => {
    try {
        const { date, format, batch, college, course, branch, year, semester } = req.query;
        const reportDate = date || getCurrentISTDate();
        const normalizedFormat = (format || 'xlsx').toLowerCase();

        // Re-use logic from getDayEndReport to fetch data
        // For DRY, we should ideally refactor this into a service, but for now duplicate query logic
        let query = `
            SELECT 
                s.college,
                s.batch,
                s.course,
                s.branch,
                s.current_year AS year,
                s.current_semester AS semester,
                COUNT(s.id) AS total_students,
                SUM(CASE WHEN ia.status = 'Present' THEN 1 ELSE 0 END) AS present,
                SUM(CASE WHEN ia.status = 'Absent' THEN 1 ELSE 0 END) AS absent,
                SUM(CASE WHEN ia.status = 'Rejected' THEN 1 ELSE 0 END) AS rejected,
                MAX(COALESCE(ia.check_out_time, ia.check_in_time)) AS last_updated
            FROM students s
            JOIN internship_assignments i_assign
                ON s.id = i_assign.student_id
                AND ? BETWEEN i_assign.start_date AND i_assign.end_date
            LEFT JOIN internship_attendance ia 
                ON s.id = ia.student_id 
                AND ia.attendance_date = ?
            WHERE s.student_status = 'Regular'
        `;

        const params = [reportDate, reportDate];

        if (batch) { query += ' AND s.batch = ?'; params.push(batch); }
        if (college) { query += ' AND s.college = ?'; params.push(college); }
        if (course) { query += ' AND s.course = ?'; params.push(course); }
        if (branch) { query += ' AND s.branch = ?'; params.push(branch); }
        if (year) { query += ' AND s.current_year = ?'; params.push(year); }
        if (semester) { query += ' AND s.current_semester = ?'; params.push(semester); }

        query += `
            GROUP BY s.college, s.batch, s.course, s.branch, s.current_year, s.current_semester
            ORDER BY s.college, s.batch, s.course, s.branch, s.current_year, s.current_semester
        `;

        const [groupedRows] = await masterPool.query(query, params);

        const groupedData = groupedRows.map(row => {
            const total = Number(row.total_students) || 0;
            const present = Number(row.present) || 0;
            const absent = Number(row.absent) || 0;
            const rejected = Number(row.rejected) || 0;
            const marked = present + absent + rejected;

            return {
                college: row.college || '—',
                batch: row.batch || '—',
                course: row.course || '—',
                branch: row.branch || '—',
                year: row.year || '—',
                semester: row.semester || '—',
                totalStudents: total,
                presentToday: present,
                absentToday: absent,
                rejectedToday: rejected,
                markedToday: marked,
                pendingToday: Math.max(0, total - marked),
                lastUpdated: row.last_updated
            };
        });

        // Generate Excel
        if (normalizedFormat === 'xlsx') {
            const XLSX = require('xlsx');
            const workbook = XLSX.utils.book_new();

            // Summary Sheet calculations
            let totalStudents = 0, presentToday = 0, absentToday = 0, rejectedToday = 0, markedToday = 0;
            groupedData.forEach(d => {
                totalStudents += d.totalStudents;
                presentToday += d.presentToday;
                absentToday += d.absentToday;
                rejectedToday += d.rejectedToday;
                markedToday += d.markedToday;
            });
            const unmarkedToday = Math.max(0, totalStudents - markedToday);

            const summaryData = [
                ['Internship Day End Report'],
                ['Date', reportDate],
                [''],
                ['Summary'],
                ['Total Assigned Students', totalStudents],
                ['Total Marked', markedToday],
                ['Present', presentToday],
                ['Absent', absentToday],
                ['Rejected', rejectedToday],
                ['Unmarked', unmarkedToday],
                [''],
                ['Detailed Breakdown']
            ];
            const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
            XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

            const tableData = [
                ['College', 'Batch', 'Course', 'Branch', 'Year', 'Semester', 'Students', 'Present', 'Absent', 'Rejected', 'Marked', 'Pending', 'Last Updated'],
                ...groupedData.map(row => [
                    row.college, row.batch, row.course, row.branch, row.year, row.semester,
                    row.totalStudents, row.presentToday, row.absentToday, row.rejectedToday,
                    row.markedToday, row.pendingToday,
                    row.lastUpdated ? new Date(row.lastUpdated).toLocaleTimeString() : '—'
                ])
            ];
            const tableSheet = XLSX.utils.aoa_to_sheet(tableData);
            XLSX.utils.book_append_sheet(workbook, tableSheet, 'Grouped Data');

            const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="internship_day_end_${reportDate}.xlsx"`);
            return res.send(buffer);
        } else {
            return res.status(400).json({ success: false, message: 'Only XLSX format is currently supported.' });
        }

    } catch (error) {
        console.error('Error generating day end report download:', error);
        res.status(500).json({ success: false, message: 'Server error while generating download.' });
    }
};

// helper that inserts 'Absent' records for any student who is assigned,
// has no attendance for a given date and whose internship location's
// allowed_end_time has already passed the current server time.
async function autoMarkAbsentees(reportDate) {
    const istToday = getCurrentISTDate();
    // For past dates, consider the day as ended (use a time past allowed_end_time)
    // For today, use current IST time
    const isToday = reportDate === istToday;
    let nowTime;
    if (isToday) {
        const istTime = getCurrentISTTime();
        const hour = istTime.getUTCHours().toString().padStart(2, '0');
        const minute = istTime.getUTCMinutes().toString().padStart(2, '0');
        nowTime = `${hour}:${minute}`;
    } else {
        // For past dates, use a time that's guaranteed to be past allowed_end_time
        // This will mark all unmarked students as absent for past dates
        nowTime = '23:59';
    }
    try {
        const [result] = await masterPool.query(
            `
            INSERT INTO internship_attendance (student_id, internship_id, attendance_date, status, created_at)
            SELECT ia.student_id, ia.internship_id, ?, 'Absent', NOW()
            FROM internship_assignments ia
            JOIN internship_locations il ON ia.internship_id = il.id
            LEFT JOIN internship_attendance att 
                ON att.student_id = ia.student_id 
                AND att.attendance_date = ?
            WHERE ia.start_date <= ? AND ia.end_date >= ?
              AND att.id IS NULL
              AND ? > il.allowed_end_time
            `,
            [reportDate, reportDate, reportDate, reportDate, nowTime]
        );
        if (result && result.affectedRows) {
            console.log(`autoMarkAbsentees on ${reportDate} inserted ${result.affectedRows} records (time ${nowTime})`);
        }
    } catch (err) {
        console.error('Error auto-marking absentees:', err);
    }
}

exports.getAttendanceDetails = async (req, res) => {
    try {
        const { id } = req.params;
        // id can be 'temp-studentID' or actual attendance ID
        if (id.startsWith('temp-')) {
            // parse numeric id and return a minimal response
            const sid = id.split('-')[1];
            const [students] = await masterPool.query(
                'SELECT student_name, admission_number FROM students WHERE id = ?',
                [sid]
            );
            if (students.length === 0) {
                return res.status(404).json({ success: false, message: 'Student not found.' });
            }
            const student = students[0];
            return res.json({
                success: true,
                data: {
                    studentName: student.student_name,
                    admissionNumber: student.admission_number,
                    status: 'Not Marked'
                }
            });
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
    const connection = await masterPool.getConnection();
    try {
        const { internshipId, startDate, endDate, allowedDays, filters, studentIds, overwrite } = req.body;

        if (!internshipId || !startDate || !endDate || !allowedDays) {
            return res.status(400).json({ success: false, message: 'Internship, Start Date, End Date, and Allowed Days are required.' });
        }

        let students = [];

        // 1. Find eligible students
        if (studentIds && Array.isArray(studentIds) && studentIds.length > 0) {
            const [rows] = await connection.query(
                `SELECT id FROM students 
                 WHERE id IN (?) 
                    OR admission_number IN (?) 
                    OR pin_no IN (?)`,
                [studentIds, studentIds, studentIds]
            );
            students = rows;
        } else {
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

            const [rows] = await connection.query(query, params);
            students = rows;
        }

        if (students.length === 0) {
            connection.release();
            return res.status(400).json({ success: false, message: 'No valid students found matching the selection.' });
        }

        const studentIdList = students.map(s => s.id);
        
        // 2. Check for Overlapping Assignments
        const [existingAssignments] = await connection.query(`
            SELECT ia.id, ia.student_id, s.student_name, s.admission_number, il.company_name, ia.start_date, ia.end_date, ia.allowed_days
            FROM internship_assignments ia
            JOIN students s ON ia.student_id = s.id
            JOIN internship_locations il ON ia.internship_id = il.id
            WHERE ia.student_id IN (?)
            AND ia.start_date <= ? 
            AND ia.end_date >= ?
        `, [studentIdList, endDate, startDate]);

        // Filter overlaps by checking staggered days
        const conflicts = existingAssignments.filter(ea => {
            try {
                const existingDays = typeof ea.allowed_days === 'string' ? JSON.parse(ea.allowed_days) : ea.allowed_days;
                const newDays = Array.isArray(allowedDays) ? allowedDays : [];
                // Intersection check: conflict exists only if at least one day overlaps
                return existingDays.some(day => newDays.includes(day));
            } catch (e) {
                return true; // Assume conflict if days can't be determined
            }
        });

        if (!overwrite && conflicts.length > 0) {
            connection.release();
            return res.status(409).json({
                success: false,
                message: 'Some students already have overlapping internships on these days.',
                conflicts: conflicts.map(c => ({
                    studentName: c.student_name,
                    admissionNumber: c.admission_number,
                    companyName: c.company_name,
                    startDate: c.start_date,
                    endDate: c.end_date
                }))
            });
        }

        // 3. Execution with Transaction
        await connection.beginTransaction();
        try {
            // Delete existing true overlaps if overwriting
            if (overwrite && conflicts.length > 0) {
                const conflictIds = conflicts.map(c => c.id);
                await connection.query(`DELETE FROM internship_assignments WHERE id IN (?)`, [conflictIds]);
            }

            // Prepare bulk insert
            const allowedDaysStr = JSON.stringify(allowedDays);
            const values = students.map(s => [s.id, internshipId, startDate, endDate, allowedDaysStr]);

            if (values.length > 0) {
                const sql = `INSERT INTO internship_assignments (student_id, internship_id, start_date, end_date, allowed_days) VALUES ?`;
                await connection.query(sql, [values]);
            }

            // 4. Attendance Re-validation (If overwriting)
            if (overwrite) {
                await revalidateAttendanceInternal(connection, studentIdList, startDate, endDate, internshipId);
            }

            await connection.commit();
            res.json({
                success: true,
                message: overwrite 
                    ? `Successfully updated internship and re-validated attendance for ${students.length} students.`
                    : `Successfully assigned internship to ${students.length} students.`
            });
        } catch (txError) {
            await connection.rollback();
            throw txError;
        } finally {
            connection.release();
        }

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

        // 2. Verify Student Assignment for this Internship
        const istDate = getCurrentISTDate();
        const istDayShort = getCurrentISTDayShort();
        
        const [assignments] = await masterPool.query(
            `SELECT ia.*, il.allowed_start_time, il.allowed_end_time, il.latitude, il.longitude, il.radius, il.company_name
             FROM internship_assignments ia
             JOIN internship_locations il ON ia.internship_id = il.id
             WHERE ia.student_id = ? AND ia.internship_id = ? 
             AND ? BETWEEN ia.start_date AND ia.end_date
             AND JSON_CONTAINS(ia.allowed_days, JSON_QUOTE(?))`,
            [studentId, internshipId, istDate, istDayShort]
        );

        if (assignments.length === 0) {
            console.warn(`Student ${studentId} attempted attendance for internship ${internshipId} without valid assignment for ${istDate} (${istDayShort})`);
            return res.status(403).json({
                success: false,
                message: 'You are not assigned to this internship for today. Please contact your coordinator.'
            });
        }

        const assignment = assignments[0];
        const internship = assignment; // Contains joined internship_locations fields

        // 3. Distance Calculation
        const distance = calculateDistance(latitude, longitude, parseFloat(internship.latitude), parseFloat(internship.longitude));
        console.log(`Distance for student ${studentId}: ${distance}m (Allowed: ${internship.radius}m)`);

        // 4. Radius Check (Allow but Mark as Suspicious)
        if (!isSuspicious && distance > internship.radius) {
            isSuspicious = true;
            suspiciousReason = `Outside Radius: ${Math.round(distance)}m (Allowed: ${internship.radius}m)`;
            console.log(`Student ${studentId} is outside radius but attendance recorded as Suspicious.`);
        }

        // 5. Time Check (using IST)
        const istTime = getCurrentISTTime();
        const currentHour = istTime.getUTCHours().toString().padStart(2, '0');
        const currentMinute = istTime.getUTCMinutes().toString().padStart(2, '0');
        const currentTimeStr = `${currentHour}:${currentMinute}`;

        if (currentTimeStr < internship.allowed_start_time || currentTimeStr > internship.allowed_end_time) {
            console.warn(`Attendance attempt outside hours: ${currentTimeStr} (IST), Allowed: ${internship.allowed_start_time} - ${internship.allowed_end_time}`);
            return res.status(400).json({
                success: false,
                message: `Attendance is only allowed between ${internship.allowed_start_time} and ${internship.allowed_end_time} (IST).`
            });
        }

        // 6. Check-In/Check-out Logic

        // DEVICE FINGERPRINT CHECK
        if (deviceFingerprint) {
            const [duplicates] = await masterPool.query(
                `SELECT student_id FROM internship_attendance 
                 WHERE device_fingerprint = ? AND attendance_date = ? AND student_id != ?`,
                [deviceFingerprint, istDate, studentId]
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
            [studentId, internshipId, istDate]
        );

        let attendance = existing[0];

        if (attendance) {
            // existing record already present
            if (attendance.status === 'Absent') {
                return res.status(400).json({ success: false, message: 'Attendance has already been recorded as absent; cannot check in.' });
            }
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

                // Determine Status for Check-out
                let finalStatus = 'Present';
                // Check Distance at Check-out
                if (distance > internship.radius) {
                    finalStatus = 'Absent';
                    const distMsg = `Outside Radius at Checkout: ${Math.round(distance)}m`;

                    if (isSuspicious) {
                        suspiciousReason += " | " + distMsg;
                    } else {
                        isSuspicious = true;
                        suspiciousReason = distMsg;
                    }
                }

                // Combine new suspicious reason with existing one
                let finalReasonToSave = attendance.suspicious_reason || '';
                if (isSuspicious && suspiciousReason) {
                    if (finalReasonToSave) finalReasonToSave += " | ";
                    finalReasonToSave += suspiciousReason;
                }

                // If either existing or new is suspicious, mark as 1
                const finalIsSuspicious = (attendance.is_suspicious || isSuspicious) ? 1 : 0;

                await masterPool.query(
                    `UPDATE internship_attendance 
                     SET check_out_time = NOW(), check_out_location = ?, status = ?, 
                     is_suspicious = ?, suspicious_reason = ?
                     WHERE id = ?`,
                    [checkOutLocation, finalStatus, finalIsSuspicious, finalReasonToSave, attendance.id]
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
                    [studentId, internshipId, checkInLocation, istDate, `Extreme Distance: ${Math.round(distance)}m`, deviceFingerprint]
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

            // Determine Status
            // If outside radius, mark as Absent (as requested by user)
            let initialStatus = 'Present';
            if (distance > internship.radius) {
                initialStatus = 'Absent';
            }

            const [result] = await masterPool.query(
                `INSERT INTO internship_attendance 
                (student_id, internship_id, check_in_time, check_in_location, status, attendance_date, is_suspicious, suspicious_reason, device_fingerprint) 
                VALUES (?, ?, NOW(), ?, ?, ?, ?, ?, ?)`,
                [studentId, internshipId, checkInLocation, initialStatus, istDate, isSuspicious, suspiciousReason, deviceFingerprint]
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
        const today = getCurrentISTDate();

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

exports.getInternshipFilters = async (req, res) => {
    try {
        const { batch, college, course, branch, year, semester, location } = req.query;

        let query = `
            SELECT DISTINCT
                s.batch,
                s.course,
                s.branch,
                s.current_year,
                s.current_semester,
                s.college
            FROM students s
            JOIN internship_assignments ia ON s.id = ia.student_id
            WHERE ia.end_date >= CURDATE()
            AND s.student_status = 'Regular'
        `;

        const params = [];

        // Apply filters dynamically for cascading
        if (location) { query += ' AND ia.internship_id = ?'; params.push(location); }
        if (batch) { query += ' AND s.batch = ?'; params.push(batch); }
        if (college) { query += ' AND s.college = ?'; params.push(college); }
        if (course) { query += ' AND s.course = ?'; params.push(course); }
        if (branch) { query += ' AND s.branch = ?'; params.push(branch); }
        if (year) { query += ' AND s.current_year = ?'; params.push(year); }
        if (semester) { query += ' AND s.current_semester = ?'; params.push(semester); }

        query += ' ORDER BY s.batch, s.course, s.branch';

        const [rows] = await masterPool.query(query, params);

        // Extract unique values
        const batches = [...new Set(rows.map(r => r.batch).filter(Boolean))].sort();
        const courses = [...new Set(rows.map(r => r.course).filter(Boolean))].sort();
        const branches = [...new Set(rows.map(r => r.branch).filter(Boolean))].sort();
        const years = [...new Set(rows.map(r => r.current_year).filter(Boolean))].sort((a, b) => a - b);
        const semesters = [...new Set(rows.map(r => r.current_semester).filter(Boolean))].sort((a, b) => a - b);
        const colleges = [...new Set(rows.map(r => r.college).filter(Boolean))].sort();

        // Fetch locations list with their standard duration (min start to max end)
        const [locationRows] = await masterPool.query(`
            SELECT 
                il.id, 
                il.company_name,
                DATE_FORMAT(MIN(ia.start_date), '%Y-%m-%d') as min_start,
                DATE_FORMAT(MAX(ia.end_date), '%Y-%m-%d') as max_end
            FROM internship_locations il
            JOIN internship_assignments ia ON il.id = ia.internship_id
            WHERE ia.end_date >= CURDATE()
            AND il.is_active = 1
            GROUP BY il.id, il.company_name
            ORDER BY il.company_name
        `);

        const locations = locationRows.map(loc => ({
            id: loc.id,
            companyName: loc.company_name,
            startDate: loc.min_start,
            endDate: loc.max_end
        }));

        res.json({
            success: true,
            data: {
                locations,
                batches,
                courses,
                branches,
                years,
                semesters,
                colleges
            }
        });
    } catch (error) {
        console.error('Error fetching internship filters:', error);
        res.status(500).json({ success: false, message: 'Server error fetching filters' });
    }
};

exports.getEligibleStudents = async (req, res) => {
    try {
        const { batch, college, course, branch, year, semester } = req.query;

        // Base query for all regular students, with LEFT JOIN to find active internships
        let query = `
            SELECT 
                s.id, 
                s.student_name, 
                s.admission_number, 
                s.batch, 
                s.course, 
                s.branch, 
                s.current_year, 
                s.current_semester,
                il.company_name AS current_company,
                ia.start_date AS current_start_date,
                ia.end_date AS current_end_date
            FROM students s
            LEFT JOIN internship_assignments ia ON s.id = ia.student_id AND ia.end_date >= CURDATE()
            LEFT JOIN internship_locations il ON ia.internship_id = il.id
            WHERE s.student_status = 'Regular'
        `;
        const params = [];

        if (batch) { query += ' AND s.batch = ?'; params.push(batch); }
        if (college) { query += ' AND s.college = ?'; params.push(college); }
        if (course) { query += ' AND s.course = ?'; params.push(course); }
        if (branch) { query += ' AND s.branch = ?'; params.push(branch); }
        if (year) { query += ' AND s.current_year = ?'; params.push(year); }
        if (semester) { query += ' AND s.current_semester = ?'; params.push(semester); }

        query += ' ORDER BY s.student_name ASC';

        const [rows] = await masterPool.query(query, params);

        res.json({
            success: true,
            data: rows
        });
    } catch (error) {
        console.error('Error fetching eligible students:', error);
        res.status(500).json({ success: false, message: 'Server error fetching students' });
    }
};

exports.deleteInternshipLocation = async (req, res) => {
    try {
        const { id } = req.params;

        // Check for existing assignments
        const [assignments] = await masterPool.query(
            'SELECT count(*) as count FROM internship_assignments WHERE internship_id = ?',
            [id]
        );

        if (assignments[0].count > 0) {
            return res.status(400).json({
                success: false,
                message: `Cannot delete location. It has ${assignments[0].count} active or past assignments.`
            });
        }

        await masterPool.query('DELETE FROM internship_locations WHERE id = ?', [id]);

        res.json({ success: true, message: 'Location deleted successfully' });
    } catch (error) {
        console.error('Error deleting location:', error);
        res.status(500).json({ success: false, message: 'Failed to delete location' });
    }
};

exports.revalidateAttendanceByFilters = async (req, res) => {
    try {
        const { locationId, batch, course, branch, year, semester, startDate, endDate } = req.body;
        
        if (!startDate || !endDate) {
            return res.status(400).json({ success: false, message: 'Start date and End date are required for re-validation.' });
        }

        const connection = await masterPool.getConnection();
        try {
            await connection.beginTransaction();

            // 1. Find all students matching filters
            let studentQuery = `SELECT DISTINCT s.id FROM students s JOIN internship_assignments ia ON s.id = ia.student_id WHERE s.student_status = 'Regular'`;
            const params = [];

            if (locationId) { studentQuery += ' AND ia.internship_id = ?'; params.push(locationId); }
            if (batch) { studentQuery += ' AND s.batch = ?'; params.push(batch); }
            if (course) { studentQuery += ' AND s.course = ?'; params.push(course); }
            if (branch) { studentQuery += ' AND s.branch = ?'; params.push(branch); }
            if (year) { studentQuery += ' AND s.current_year = ?'; params.push(year); }
            if (semester) { studentQuery += ' AND s.current_semester = ?'; params.push(semester); }

            const [students] = await connection.query(studentQuery, params);
            if (students.length === 0) {
                await connection.rollback();
                return res.status(404).json({ success: false, message: 'No students found matching the filters.' });
            }

            const studentIdList = students.map(s => s.id);
            
            // 2. Fetch assignments for these students that overlap with the date range
            let assignQuery = `
                SELECT student_id, internship_id, start_date, end_date 
                FROM internship_assignments 
                WHERE student_id IN (?) 
                AND (
                    (start_date BETWEEN ? AND ?) 
                    OR (end_date BETWEEN ? AND ?) 
                    OR (? BETWEEN start_date AND end_date)
                )
            `;
            const [assignments] = await connection.query(assignQuery, [studentIdList, startDate, endDate, startDate, endDate, startDate]);

            let totalUpdated = 0;
            for (const asgn of assignments) {
                // Determine overlapping range
                const rangeStart = asgn.start_date > new Date(startDate) ? asgn.start_date : new Date(startDate);
                const rangeEnd = asgn.end_date < new Date(endDate) ? asgn.end_date : new Date(endDate);
                
                const count = await revalidateAttendanceInternal(
                    connection, 
                    [asgn.student_id], 
                    fmtDate(rangeStart), 
                    fmtDate(rangeEnd), 
                    asgn.internship_id
                );
                totalUpdated += count;
            }

            await connection.commit();
            res.json({ success: true, message: `Re-validation complete. Updated ${totalUpdated} attendance records.` });
        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Error in revalidateAttendanceByFilters:', error);
        res.status(500).json({ success: false, message: 'Server error during re-validation.' });
    }
};

// ─── Auto-run DB migrations on first require (MySQL 5.6/5.7/8 compatible) ─────
(async () => {
    try {
        const [[{ db }]] = await masterPool.query('SELECT DATABASE() AS db');

        // Helper: add a column only if it doesn't already exist
        const addColumnIfMissing = async (table, column, definition) => {
            const [[{ count }]] = await masterPool.query(
                `SELECT COUNT(*) AS \`count\` FROM INFORMATION_SCHEMA.COLUMNS
                 WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
                [db, table, column]
            );
            if (count === 0) {
                await masterPool.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
                console.log(`[Internship] Added column: ${table}.${column}`);
            }
        };

        // 1. Add manual-marking columns to internship_attendance
        await addColumnIfMissing('internship_attendance', 'is_manual',      'BOOLEAN NOT NULL DEFAULT FALSE');
        await addColumnIfMissing('internship_attendance', 'marked_by',      'INT NULL');
        await addColumnIfMissing('internship_attendance', 'marked_by_name', 'VARCHAR(120) NULL');
        await addColumnIfMissing('internship_attendance', 'manual_reason',  'TEXT NULL');

        // 2. Create audit log table
        await masterPool.query(`
            CREATE TABLE IF NOT EXISTS internship_attendance_audit (
                id INT AUTO_INCREMENT PRIMARY KEY,
                internship_attendance_id INT NULL,
                student_id INT NOT NULL,
                attendance_date DATE NOT NULL,
                old_status VARCHAR(30) NULL,
                new_status VARCHAR(30) NOT NULL,
                changed_by INT NOT NULL,
                changed_by_name VARCHAR(120) NOT NULL,
                reason TEXT NOT NULL,
                changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_student_audit (student_id, attendance_date),
                INDEX idx_changed_by (changed_by),
                INDEX idx_changed_at (changed_at)
            )
        `);
        console.log('[Internship] DB migrations applied successfully.');
    } catch (err) {
        console.warn('[Internship] Migration warning:', err.message);
    }
})();

// ─── Helper: format Date object → YYYY-MM-DD string ──────────────────────────
const fmtDate = (d) => {
    if (!d) return null;
    if (typeof d === 'string') return d.split('T')[0];
    return d.toISOString().split('T')[0];
};

// ─── Helper: enumerate all dates between start and end (inclusive) ────────────
const enumerateDates = (start, end) => {
    const dates = [];
    const cur = new Date(start);
    const finish = new Date(end);
    while (cur <= finish) {
        dates.push(fmtDate(cur));
        cur.setDate(cur.getDate() + 1);
    }
    return dates;
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /internship/period-report
// Returns per-student attendance stats over their full assignment date range
// ─────────────────────────────────────────────────────────────────────────────
exports.getPeriodReport = async (req, res) => {
    try {
        const { batch, college, course, branch, year, semester, location, startDate, endDate } = req.query;

        // 1. Fetch all assignments (with optional filters)
        let assignQuery = `
            SELECT
                ia.id AS assignment_id,
                ia.student_id,
                ia.internship_id,
                DATE_FORMAT(ia.start_date, '%Y-%m-%d') AS start_date,
                DATE_FORMAT(ia.end_date,   '%Y-%m-%d') AS end_date,
                ia.allowed_days,
                s.student_name,
                s.admission_number,
                s.pin_no,
                s.batch,
                s.course,
                s.branch,
                s.college,
                s.current_year,
                s.current_semester,
                il.company_name,
                il.address AS company_address
            FROM internship_assignments ia
            JOIN students s ON s.id = ia.student_id
            JOIN internship_locations il ON il.id = ia.internship_id
            WHERE s.student_status = 'Regular'
        `;
        const params = [];

        if (location) { assignQuery += ' AND ia.internship_id = ?'; params.push(location); }
        if (batch)    { assignQuery += ' AND s.batch = ?';          params.push(batch); }
        if (college)  { assignQuery += ' AND s.college = ?';        params.push(college); }
        if (course)   { assignQuery += ' AND s.course = ?';         params.push(course); }
        if (branch)   { assignQuery += ' AND s.branch = ?';         params.push(branch); }
        if (year)     { assignQuery += ' AND s.current_year = ?';   params.push(year); }
        if (semester) { assignQuery += ' AND s.current_semester = ?'; params.push(semester); }

        assignQuery += ' ORDER BY s.student_name ASC';
        const [assignments] = await masterPool.query(assignQuery, params);

        if (assignments.length === 0) {
            return res.json({ success: true, data: [] });
        }

        const studentIds = [...new Set(assignments.map(a => a.student_id))];

        // 2. Fetch internship_attendance records (GPS check-ins)
        const [internshipRows] = await masterPool.query(`
            SELECT
                student_id,
                DATE_FORMAT(attendance_date, '%Y-%m-%d') AS attendance_date,
                status,
                is_manual,
                marked_by_name,
                check_in_time,
                check_out_time
            FROM internship_attendance
            WHERE student_id IN (?)
            ORDER BY attendance_date ASC
        `, [studentIds]);

        // 3. Fetch regular attendance_records (college roll-call) for the same students
        const [regularRows] = await masterPool.query(`
            SELECT
                student_id,
                DATE_FORMAT(attendance_date, '%Y-%m-%d') AS attendance_date,
                status
            FROM attendance_records
            WHERE student_id IN (?)
            ORDER BY attendance_date ASC
        `, [studentIds]);

        // Build maps: student_id → date → record
        // internshipMap has GPS/manual records (higher priority)
        const internshipMap = new Map();
        internshipRows.forEach(row => {
            if (!internshipMap.has(row.student_id)) internshipMap.set(row.student_id, new Map());
            internshipMap.get(row.student_id).set(row.attendance_date, row);
        });

        // regularMap has regular roll-call records (fallback)
        const regularMap = new Map();
        regularRows.forEach(row => {
            if (!regularMap.has(row.student_id)) regularMap.set(row.student_id, new Map());
            // Normalise status: regular uses lowercase 'present'/'absent'
            regularMap.get(row.student_id).set(row.attendance_date, {
                ...row,
                // Map regular statuses to internship statuses for consistency
                status: row.status === 'present' ? 'Present'
                      : row.status === 'absent'  ? 'Absent'
                      : row.status === 'holiday' ? 'Holiday'
                      : row.status
            });
        });

        // 4. Build per-student report
        // Group assignments by student_id to merge staggered schedules
        const studentGroups = new Map();
        assignments.forEach(asgn => {
            if (!studentGroups.has(asgn.student_id)) {
                studentGroups.set(asgn.student_id, {
                    studentId: asgn.student_id,
                    studentName: asgn.student_name,
                    admissionNumber: asgn.admission_number,
                    pinNo: asgn.pin_no,
                    batch: asgn.batch,
                    course: asgn.course,
                    branch: asgn.branch,
                    college: asgn.college,
                    year: asgn.current_year,
                    semester: asgn.current_semester,
                    assignments: []
                });
            }
            
            const allowedDays = (() => {
                try {
                    const d = typeof asgn.allowed_days === 'string' ? JSON.parse(asgn.allowed_days) : asgn.allowed_days;
                    return Array.isArray(d) ? d : [];
                } catch { return []; }
            })();
            
            const DAY_MAP = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
            const allowedDayNums = new Set(allowedDays.map(d => DAY_MAP[d]).filter(n => n !== undefined));

            studentGroups.get(asgn.student_id).assignments.push({
                ...asgn,
                allowedDays,
                allowedDayNums
            });
        });

        const report = Array.from(studentGroups.values()).map(student => {
            const studentIntMap = internshipMap.get(student.studentId) || new Map();
            const studentRegMap = regularMap.get(student.studentId)    || new Map();

            // Range requested by user
            const allDatesInRange = enumerateDates(startDate, endDate);
            
            const dayBreakdown = allDatesInRange.map(date => {
                const intRec = studentIntMap.get(date);
                const regRec = studentRegMap.get(date);

                if (intRec) {
                    // Internship record exists
                    return {
                        date,
                        status: intRec.status,
                        source: 'internship',
                        isManual: Boolean(intRec.is_manual),
                        markedByName: intRec.marked_by_name || null,
                        checkInTime: intRec.check_in_time || null,
                        checkOutTime: intRec.check_out_time || null
                    };
                } else if (regRec?.status === 'Holiday') {
                    // Holiday fallback from college calendar
                    return {
                        date,
                        status: 'Holiday',
                        source: 'holiday',
                        isManual: false,
                    };
                } else {
                    // Check if student was scheduled for internship on this specific date
                    const schedule = student.assignments.find(asgn => {
                        const isWithinRange = date >= asgn.start_date && date <= asgn.end_date;
                        const dayNum = new Date(date).getDay();
                        const isWorkingDay = asgn.allowedDayNums.has(dayNum);
                        return isWithinRange && isWorkingDay;
                    });

                    if (schedule) {
                        return {
                            date,
                            status: 'Not Marked',
                            source: 'none',
                            isManual: false,
                        };
                    } else {
                        // Not an internship day, and not a holiday
                        return {
                            date,
                            status: '—', // Or 'Not Required'
                            source: 'none',
                            isManual: false,
                        };
                    }
                }
            });

            const countableDay = d => d.status !== 'Holiday' && d.status !== '—';
            const totalDays   = dayBreakdown.filter(countableDay).length;
            const presentDays = dayBreakdown.filter(d => d.status === 'Present').length;
            const absentDays  = dayBreakdown.filter(d => d.status === 'Absent').length;
            const notMarked   = dayBreakdown.filter(d => d.status === 'Not Marked').length;
            const percentage  = totalDays > 0
                ? parseFloat(((presentDays / totalDays) * 100).toFixed(2))
                : 0;

            // Use the first assignment's company info for summary (if merged, maybe show "Multiple")
            const firstAsgn = student.assignments[0];

            return {
                assignmentId: firstAsgn.assignment_id, // For keying in frontend
                studentId: student.studentId,
                studentName: student.studentName,
                admissionNumber: student.admissionNumber,
                pinNo: student.pinNo,
                batch: student.batch,
                course: student.course,
                branch: student.branch,
                college: student.college,
                year: student.year,
                semester: student.semester,
                companyName: student.assignments.length > 1 ? 'Multiple Locations' : firstAsgn.company_name,
                companyAddress: student.assignments.length > 1 ? '—' : firstAsgn.company_address,
                startDate: firstAsgn.start_date,
                endDate: firstAsgn.end_date,
                allowedDays: firstAsgn.allowedDays,
                totalDays,
                presentDays,
                absentDays,
                notMarked,
                attendancePercentage: percentage,
                dayBreakdown
            };
        });

        res.json({ success: true, data: report });
    } catch (error) {
        console.error('Error generating period report:', error);
        res.status(500).json({ success: false, message: 'Server error generating period report' });
    }
};


// ─────────────────────────────────────────────────────────────────────────────
// GET /internship/students-for-date?date=YYYY-MM-DD&batch=&course=&...
// Returns all students with active assignments on a given date + current status
// ─────────────────────────────────────────────────────────────────────────────
exports.getStudentsForDate = async (req, res) => {
    try {
        const { date, batch, college, course, branch, year, semester, location } = req.query;

        if (!date) {
            return res.status(400).json({ success: false, message: 'date param is required' });
        }

        let query = `
            SELECT
                s.id AS student_id,
                s.student_name,
                s.admission_number,
                s.pin_no,
                s.batch,
                s.course,
                s.branch,
                s.college,
                s.current_year,
                s.current_semester,
                il.company_name,
                ia.id AS assignment_id,
                DATE_FORMAT(ia.start_date, '%Y-%m-%d') AS start_date,
                DATE_FORMAT(ia.end_date,   '%Y-%m-%d') AS end_date,
                att.id AS attendance_id,
                att.status AS current_status,
                att.is_manual,
                att.marked_by_name
            FROM students s
            JOIN internship_assignments ia
                ON s.id = ia.student_id
                AND ? BETWEEN ia.start_date AND ia.end_date
            JOIN internship_locations il ON il.id = ia.internship_id
            LEFT JOIN internship_attendance att
                ON att.student_id = s.id AND att.attendance_date = ?
            WHERE s.student_status = 'Regular'
        `;
        const params = [date, date];

        if (location) { query += ' AND ia.internship_id = ?'; params.push(location); }
        if (batch)    { query += ' AND s.batch = ?';          params.push(batch); }
        if (college)  { query += ' AND s.college = ?';        params.push(college); }
        if (course)   { query += ' AND s.course = ?';         params.push(course); }
        if (branch)   { query += ' AND s.branch = ?';         params.push(branch); }
        if (year)     { query += ' AND s.current_year = ?';   params.push(year); }
        if (semester) { query += ' AND s.current_semester = ?'; params.push(semester); }

        query += ' ORDER BY s.student_name ASC';

        const [rows] = await masterPool.query(query, params);

        const data = rows.map(row => ({
            studentId: row.student_id,
            studentName: row.student_name,
            admissionNumber: row.admission_number,
            pinNo: row.pin_no,
            batch: row.batch,
            course: row.course,
            branch: row.branch,
            college: row.college,
            year: row.current_year,
            semester: row.current_semester,
            companyName: row.company_name,
            assignmentId: row.assignment_id,
            startDate: row.start_date,
            endDate: row.end_date,
            attendanceId: row.attendance_id || null,
            currentStatus: row.current_status || 'Not Marked',
            isManual: Boolean(row.is_manual),
            markedByName: row.marked_by_name || null
        }));

        res.json({ success: true, data });
    } catch (error) {
        console.error('Error fetching students for date:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /internship/manual-attendance  (Super Admin only)
// Body: { student_id, attendance_date, status, reason }
// Upserts internship_attendance + writes audit log entry
// ─────────────────────────────────────────────────────────────────────────────
exports.manualMarkAttendance = async (req, res) => {
    try {
        const adminUser = req.admin || req.user;
        if (!adminUser) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }

        // Super admin gate
        const role = adminUser.role || '';
        if (role !== 'super_admin' && role !== 'Super Admin' && role !== 'superadmin') {
            return res.status(403).json({
                success: false,
                message: 'Only Super Admins can manually mark internship attendance'
            });
        }

        const { student_id, attendance_date, status, reason } = req.body;

        if (!student_id || !attendance_date || !status) {
            return res.status(400).json({ success: false, message: 'student_id, attendance_date, and status are required' });
        }

        const validStatuses = ['Present', 'Absent'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ success: false, message: `status must be one of: ${validStatuses.join(', ')}` });
        }

        if (!reason || reason.trim().length < 5) {
            return res.status(400).json({ success: false, message: 'A reason of at least 5 characters is required' });
        }

        // Verify student has an assignment that covers this date
        const [assignments] = await masterPool.query(`
            SELECT ia.id, ia.internship_id, s.batch 
            FROM internship_assignments ia
            JOIN students s ON ia.student_id = s.id
            WHERE ia.student_id = ?
            AND ? BETWEEN ia.start_date AND ia.end_date
            LIMIT 1
        `, [student_id, attendance_date]);

        if (assignments.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No internship assignment found for this student on the given date'
            });
        }

        const assignment = assignments[0];

        // Check if backdate marking rights exist for this internship/batch/date
        const [rights] = await masterPool.query(`
            SELECT id FROM internship_backdate_rights
            WHERE internship_id = ? AND batch = ? AND date = ? AND is_active = 1
            LIMIT 1
        `, [assignment.internship_id, assignment.batch, attendance_date]);

        if (rights.length === 0) {
            return res.status(403).json({
                success: false,
                message: 'Editing is locked for this date. A Super Admin must grant marking rights first.'
            });
        }
        const markedByName = adminUser.name || adminUser.email || `Admin #${adminUser.id}`;
        const markedById = adminUser.id;

        // Check for existing record
        const [existing] = await masterPool.query(`
            SELECT id, status FROM internship_attendance
            WHERE student_id = ? AND attendance_date = ?
            LIMIT 1
        `, [student_id, attendance_date]);

        const oldStatus = existing.length > 0 ? existing[0].status : 'Not Marked';
        let attendanceId;

        if (existing.length > 0) {
            // UPDATE existing row
            await masterPool.query(`
                UPDATE internship_attendance
                SET status = ?, is_manual = TRUE, marked_by = ?, marked_by_name = ?, manual_reason = ?
                WHERE id = ?
            `, [status, markedById, markedByName, reason.trim(), existing[0].id]);
            attendanceId = existing[0].id;
        } else {
            // INSERT new row
            const [insertResult] = await masterPool.query(`
                INSERT INTO internship_attendance
                    (student_id, internship_id, attendance_date, status, is_manual, marked_by, marked_by_name, manual_reason)
                VALUES (?, ?, ?, ?, TRUE, ?, ?, ?)
            `, [student_id, assignment.internship_id, attendance_date, status, markedById, markedByName, reason.trim()]);
            attendanceId = insertResult.insertId;
        }

        // Write audit log
        await masterPool.query(`
            INSERT INTO internship_attendance_audit
                (internship_attendance_id, student_id, attendance_date, old_status, new_status, changed_by, changed_by_name, reason)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [attendanceId, student_id, attendance_date, oldStatus, status, markedById, markedByName, reason.trim()]);

        res.json({
            success: true,
            message: `Attendance marked as ${status} for ${attendance_date}`,
            data: { attendanceId, oldStatus, newStatus: status, markedByName }
        });
    } catch (error) {
        console.error('Error in manualMarkAttendance:', error);
        res.status(500).json({ success: false, message: 'Server error while marking attendance' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /internship/audit-log?student_id=&from=&to=&limit=50&offset=0
// Returns internship_attendance_audit rows
// ─────────────────────────────────────────────────────────────────────────────
exports.getAuditLog = async (req, res) => {
    try {
        const { student_id, from, to, limit = 50, offset = 0 } = req.query;

        let query = `
            SELECT
                a.id,
                a.student_id,
                s.student_name,
                s.admission_number,
                DATE_FORMAT(a.attendance_date, '%Y-%m-%d') AS attendance_date,
                a.old_status,
                a.new_status,
                a.changed_by_name,
                a.reason,
                a.changed_at
            FROM internship_attendance_audit a
            JOIN students s ON s.id = a.student_id
            WHERE 1=1
        `;
        const params = [];

        if (student_id) { query += ' AND a.student_id = ?';  params.push(student_id); }
        if (from)       { query += ' AND a.attendance_date >= ?'; params.push(from); }
        if (to)         { query += ' AND a.attendance_date <= ?'; params.push(to); }

        query += ` ORDER BY a.changed_at DESC LIMIT ? OFFSET ?`;
        params.push(parseInt(limit, 10), parseInt(offset, 10));

        const [rows] = await masterPool.query(query, params);

        // Count
        let countQuery = `SELECT COUNT(*) AS total FROM internship_attendance_audit a WHERE 1=1`;
        const countParams = [];
        if (student_id) { countQuery += ' AND a.student_id = ?';       countParams.push(student_id); }
        if (from)       { countQuery += ' AND a.attendance_date >= ?';  countParams.push(from); }
        if (to)         { countQuery += ' AND a.attendance_date <= ?';  countParams.push(to); }
        const [[{ total }]] = await masterPool.query(countQuery, countParams);

        res.json({
            success: true,
            data: rows,
            pagination: { total: Number(total), limit: parseInt(limit, 10), offset: parseInt(offset, 10) }
        });
    } catch (error) {
        console.error('Error fetching audit log:', error);
        res.status(500).json({ success: false, message: 'Server error fetching audit log' });
    }
};// -----------------------------------------------------------------------------
// GET /internship/active-groups
// Returns Location + Batch pairs that currently have student assignments
// -----------------------------------------------------------------------------
exports.getActiveGroups = async (req, res) => {
    try {
        const query = `
            SELECT 
                il.id as location_id, 
                il.company_name, 
                s.batch, 
                COUNT(DISTINCT ia.student_id) as student_count, 
                MIN(ia.start_date) as start_date, 
                MAX(ia.end_date) as end_date 
            FROM internship_assignments ia 
            JOIN internship_locations il ON il.id = ia.internship_id 
            JOIN students s ON s.id = ia.student_id
            GROUP BY il.id, il.company_name, s.batch 
            ORDER BY il.company_name, s.batch DESC
        `;
        const [rows] = await masterPool.query(query);
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('Failed to fetch active groups:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};

// -----------------------------------------------------------------------------
// POST /internship/grant-backdate-rights
// -----------------------------------------------------------------------------
exports.grantBackdateRights = async (req, res) => {
    try {
        const { internship_id, batch, date } = req.body;
        const granted_by = req.user.id;

        if (!internship_id || !batch || !date) {
            return res.status(400).json({ success: false, message: 'Internship, Batch, and Date are required.' });
        }

        // Optional: Revoke existing active rights for the same session to keep it clean
        // await masterPool.query("UPDATE internship_backdate_rights SET is_active = 0 WHERE internship_id = ? AND batch = ? AND date = ?", [internship_id, batch, date]);

        await masterPool.query(`
            INSERT INTO internship_backdate_rights (internship_id, batch, date, granted_by)
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE is_active = 1
        `, [internship_id, batch, date, granted_by]);

        res.json({ success: true, message: 'Marking rights granted successfully.' });
    } catch (error) {
        console.error('Failed to grant backdate rights:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};

// -----------------------------------------------------------------------------
// GET /internship/active-backdate-rights
// -----------------------------------------------------------------------------
exports.getActiveBackdateRights = async (req, res) => {
    try {
        const [rows] = await masterPool.query(`
            SELECT id, internship_id, batch, date, granted_at 
            FROM internship_backdate_rights 
            WHERE is_active = 1
        `);
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('Failed to fetch active backdate rights:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};
