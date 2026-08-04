
exports.getInternshipFilters = async (req, res) => {
    try {
        const { batch, college, course, branch, year, semester } = req.query;

        let query = `
            SELECT DISTINCT
                s.batch,
                s.course,
                s.branch,
                s.current_year,
                s.current_semester,
                s.college
            FROM students s LEFT JOIN colleges ON s.college_id = colleges.id LEFT JOIN courses ON s.course_id = courses.id LEFT JOIN course_branches ON s.branch_id = course_branches.id
            JOIN internship_assignments ia ON s.id = ia.student_id
            WHERE ia.end_date >= CURDATE()
            AND s.student_status = 'Regular'
        `;

        const params = [];

        // Apply filters dynamically for cascading
        if (batch) { query += ' AND s.batch = ?'; params.push(batch); }
        if (college) {
      if (/^\d+$/.test(college)) {
        query += ' AND s.college_id = ?';
        params.push(parseInt(college, 10));
      } else {
        if (/^\d+$/.test(college)) {
        query += ' AND s.college_id = ?';
        params.push(parseInt(college, 10));
      } else {
        query += ' AND s.college = ?';
        params.push(college);
      }
      }
    } // Helper if colleges have IDs
        if (course) {
      if (/^\d+$/.test(course)) {
        query += ' AND s.course_id = ?';
        params.push(parseInt(course, 10));
      } else {
        if (/^\d+$/.test(course)) {
        query += ' AND s.course_id = ?';
        params.push(parseInt(course, 10));
      } else {
        query += ' AND s.course = ?';
        params.push(course);
      }
      }
    }
        if (branch) {
      if (/^\d+$/.test(branch)) {
        query += ' AND s.branch_id = ?';
        params.push(parseInt(branch, 10));
      } else {
        if (/^\d+$/.test(branch)) {
        query += ' AND s.branch_id = ?';
        params.push(parseInt(branch, 10));
      } else {
        query += ' AND s.branch = ?';
        params.push(branch);
      }
      }
    }
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

        res.json({
            success: true,
            data: {
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
