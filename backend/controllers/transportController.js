const { masterPool } = require('../config/database');
const transportConnection = require('../config/transportDb');
const { getISTDateString } = require('../utils/dateUtils');

// Import Schemas using the new connection
// We require the Model files to get the Schema, but we must re-compile them 
// with the transportConnection because the original files compile with default mongoose.
const RouteModelInfo = require('../MongoDb-Transport/Route');
const BusModelInfo = require('../MongoDb-Transport/Bus');

// Re-compile models for Transport DB Connection
// Note: RouteModelInfo is the Model. We access .schema to re-compile.
const Route = transportConnection.model('Route', RouteModelInfo.schema);
const Bus = transportConnection.model('Bus', BusModelInfo.schema);

exports.getAllRoutes = async (req, res) => {
    try {
        const routes = await Route.find({}).sort({ routeName: 1 });
        res.json({ success: true, data: routes });
    } catch (error) {
        console.error('Error fetching routes:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch routes' });
    }
};

exports.getBuses = async (req, res) => {
    try {
        // Fetch active buses
        const buses = await Bus.find({ status: 'Active' });
        res.json({ success: true, data: buses });
    } catch (error) {
        console.error('Error fetching buses:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch buses' });
    }
};

exports.createTransportRequest = async (req, res) => {
    try {
        const student_id = req.user.id; // From auth middleware
        const { route_id, route_name, stage_name, fare, bus_id } = req.body;

        if (!route_id || !stage_name) {
            return res.status(400).json({ success: false, message: 'Route and Stage are required' });
        }

        // 1. Fetch Student details: admission_number, student_name, course, current_year, current_semester
        const [students] = await masterPool.execute(
            'SELECT admission_number, student_name, course, current_year, current_semester FROM students WHERE id = ?',
            [student_id]
        );
        if (students.length === 0) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }
        const { admission_number, student_name, course, current_year, current_semester } = students[0];

        // 2. Resolve semester info (semester_id, semester_start_date, semester_end_date, academic_year_id, year_of_study, semester_number)
        let semesterId = null;
        let semesterStartDate = null;
        let semesterEndDate = null;
        let academicYearId = null;
        const yearOfStudy = current_year != null ? Number(current_year) : null;
        const semesterNumber = current_semester != null ? Number(current_semester) : null;

        if (course && yearOfStudy != null && semesterNumber != null) {
            const [courseRows] = await masterPool.query(
                'SELECT id FROM courses WHERE name = ? AND is_active = 1 LIMIT 1',
                [course]
            );
            if (courseRows.length > 0) {
                const courseId = courseRows[0].id;
                const todayKey = getISTDateString();
                // Prefer semester that is currently active (today within start_date..end_date)
                const [semesterRows] = await masterPool.query(
                    `SELECT id, start_date, end_date, academic_year_id, year_of_study, semester_number
                     FROM semesters
                     WHERE course_id = ? AND year_of_study = ? AND semester_number = ?
                       AND start_date <= ? AND end_date >= ?
                     ORDER BY start_date DESC LIMIT 1`,
                    [courseId, yearOfStudy, semesterNumber, todayKey, todayKey]
                );
                let row = semesterRows[0];
                if (!row) {
                    const [recentRows] = await masterPool.query(
                        `SELECT id, start_date, end_date, academic_year_id, year_of_study, semester_number
                         FROM semesters
                         WHERE course_id = ? AND year_of_study = ? AND semester_number = ?
                         ORDER BY start_date DESC LIMIT 1`,
                        [courseId, yearOfStudy, semesterNumber]
                    );
                    row = recentRows[0];
                }
                if (row) {
                    semesterId = row.id;
                    semesterStartDate = row.start_date;
                    semesterEndDate = row.end_date;
                    academicYearId = row.academic_year_id;
                }
            }
        }

        // 3. Insert request with all required fields including semester/academic year
        const query = `
            INSERT INTO transport_requests 
            (admission_number, student_name, route_id, route_name, stage_name, bus_id, fare, status, request_date,
             semester_id, semester_start_date, semester_end_date, academic_year_id, year_of_study, semester_number)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', NOW(), ?, ?, ?, ?, ?, ?)
        `;
        await masterPool.execute(query, [
            admission_number,
            student_name,
            route_id,
            route_name || null,
            stage_name,
            bus_id || null,
            fare != null ? Number(fare) : 0.00,
            semesterId,
            semesterStartDate,
            semesterEndDate,
            academicYearId,
            yearOfStudy,
            semesterNumber
        ]);

        res.status(201).json({ success: true, message: 'Transport request submitted successfully' });

    } catch (error) {
        console.error('Error creating transport request:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.getMyTransportRequests = async (req, res) => {
    try {
        const student_id = req.user.id;
        
        // Fetch admission_number to query requests
        const [students] = await masterPool.execute('SELECT admission_number FROM students WHERE id = ?', [student_id]);
        
        if (students.length === 0) {
             return res.json({ success: true, data: [] });
        }
        const admission_number = students[0].admission_number;

        const [rows] = await masterPool.execute(
            'SELECT * FROM transport_requests WHERE admission_number = ? ORDER BY request_date DESC',
            [admission_number]
        );
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('Error fetching transport requests:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};
