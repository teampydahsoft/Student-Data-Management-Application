const { masterPool } = require('../config/database');

/**
 * Certificate Borrow Controller
 */
const certificateBorrowController = {
  /**
   * Get all certificates submitted by a student
   */
  getSubmittedCertificates: async (req, res) => {
    try {
      const { admissionNumber } = req.params;
      
      // Fetch student data and certificate configuration in parallel
      const [studentResult, configResult] = await Promise.all([
        masterPool.execute(
          'SELECT student_data FROM students WHERE admission_number = ?',
          [admissionNumber]
        ),
        masterPool.execute(
          'SELECT value FROM settings WHERE `key` = "certificate_config"'
        )
      ]);

      const studentRows = studentResult[0];
      const configRows = configResult[0];

      if (studentRows.length === 0) {
        return res.status(404).json({ success: false, message: 'Student not found' });
      }

      let studentData = {};
      try {
        const rawData = studentRows[0].student_data;
        studentData = typeof rawData === 'string' ? JSON.parse(rawData || '{}') : (rawData || {});
      } catch (e) {
        studentData = {};
      }

      // Get all certificate IDs from config to use as a whitelist
      let certIds = new Set();
      if (configRows.length > 0) {
        try {
          const config = JSON.parse(configRows[0].value);
          Object.values(config).forEach(levelCerts => {
            if (Array.isArray(levelCerts)) {
              levelCerts.forEach(c => certIds.add(c.id));
            }
          });
        } catch (e) {
          console.error('Error parsing certificate config:', e);
        }
      }

      // If config is missing or empty, use a sensible default whitelist
      if (certIds.size === 0) {
        ['10th_tc', '10th_study', 'inter_diploma_tc', 'inter_diploma_study', 'ug_study', 'ug_tc', 'ug_pc', 'ug_cmm', 'ug_od', 'ssc_certificate'].forEach(id => certIds.add(id));
      }

      // Filter only present/submitted certificates that are in the whitelist
      const submittedCertificates = Object.entries(studentData)
        .filter(([key, value]) => {
          // Normalize key (some might have spaces or different casing in older data, though rare)
          if (!certIds.has(key)) return false;
          
          return value === true || 
                 value === 'Yes' || 
                 value === 'Original' || 
                 value === 'Submitted' ||
                 (typeof value === 'string' && value.toLowerCase() === 'yes');
        })
        .map(([key, value]) => key);

      res.status(200).json({ success: true, data: submittedCertificates });
    } catch (error) {
      console.error('Error fetching submitted certificates:', error);
      res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
  },

  /**
   * Create a new borrow request
   */
  createRequest: async (req, res) => {
    try {
      const { admissionNumber, certificateKey, certificateName, purpose, returnDate } = req.body;

      if (!admissionNumber || !certificateKey || !certificateName || !returnDate) {
        return res.status(400).json({ success: false, message: 'Missing required fields' });
      }

      // Check for active requests for the same certificate
      const [existing] = await masterPool.execute(
        'SELECT id FROM certificate_borrow_requests WHERE admission_number = ? AND certificate_key = ? AND status IN ("pending", "approved", "issued")',
        [admissionNumber, certificateKey]
      );

      if (existing.length > 0) {
        return res.status(400).json({ 
          success: false, 
          message: 'An active request for this certificate already exists' 
        });
      }

      await masterPool.execute(
        'INSERT INTO certificate_borrow_requests (admission_number, certificate_key, certificate_name, purpose, return_date) VALUES (?, ?, ?, ?, ?)',
        [admissionNumber, certificateKey, certificateName, purpose, returnDate]
      );

      res.status(201).json({ success: true, message: 'Borrow request submitted successfully' });
    } catch (error) {
      console.error('Error creating borrow request:', error);
      res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
  },

  /**
   * Get all borrow requests (Admin)
   */
  getAllRequests: async (req, res) => {
    try {
      const { userScope } = req;
      let query = `
        SELECT r.*, s.student_name, s.course, s.branch, s.batch 
        FROM certificate_borrow_requests r
        JOIN students s ON r.admission_number = s.admission_number
      `;
      const queryParams = [];

      // Apply scoping if not unrestricted (Super Admin exception)
      if (!userScope.unrestricted) {
        const filters = [];
        
        if (userScope.collegeNames && userScope.collegeNames.length > 0) {
          filters.push(`s.college IN (${userScope.collegeNames.map(() => '?').join(',')})`);
          queryParams.push(...userScope.collegeNames);
        }
        
        if (!userScope.allCourses && userScope.courseNames && userScope.courseNames.length > 0) {
          filters.push(`s.course IN (${userScope.courseNames.map(() => '?').join(',')})`);
          queryParams.push(...userScope.courseNames);
        }
        
        if (!userScope.allBranches && userScope.branchNames && userScope.branchNames.length > 0) {
          filters.push(`s.branch IN (${userScope.branchNames.map(() => '?').join(',')})`);
          queryParams.push(...userScope.branchNames);
        }

        if (filters.length > 0) {
          query += ` WHERE ${filters.join(' AND ')}`;
        }
      }

      query += ` ORDER BY r.request_date DESC`;

      const [rows] = await masterPool.execute(query, queryParams);
      res.status(200).json({ success: true, data: rows });
    } catch (error) {
      console.error('Error fetching borrow requests:', error);
      res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
  },

  /**
   * Get student's borrow history
   */
  getStudentHistory: async (req, res) => {
    try {
      const { admissionNumber } = req.params;
      const [rows] = await masterPool.execute(
        'SELECT * FROM certificate_borrow_requests WHERE admission_number = ? ORDER BY request_date DESC',
        [admissionNumber]
      );

      res.status(200).json({ success: true, data: rows });
    } catch (error) {
      console.error('Error fetching student borrow history:', error);
      res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
  },

  /**
   * Update request status
   */
  updateStatus: async (req, res) => {
    try {
      const { id } = req.params;
      const { status, remarks, returnDate } = req.body;

      if (!status) {
        return res.status(400).json({ success: false, message: 'Status is required' });
      }

      // Fetch request details and student ID for notification
      const [requestRows] = await masterPool.execute(
        `SELECT r.certificate_name, r.admission_number, s.id as student_id 
         FROM certificate_borrow_requests r 
         JOIN students s ON r.admission_number = s.admission_number 
         WHERE r.id = ?`,
        [id]
      );

      if (requestRows.length === 0) {
        return res.status(404).json({ success: false, message: 'Request not found' });
      }

      const reqDetails = requestRows[0];

      let updateQuery = 'UPDATE certificate_borrow_requests SET status = ?, admin_remarks = ?';
      const params = [status, remarks];

      if (returnDate) {
        updateQuery += ', return_date = ?';
        params.push(returnDate);
      }

      if (status === 'issued') {
        updateQuery += ', issued_at = CURRENT_TIMESTAMP';
      } else if (status === 'returned') {
        updateQuery += ', returned_at = CURRENT_TIMESTAMP';
      }

      updateQuery += ' WHERE id = ?';
      params.push(id);

      await masterPool.execute(updateQuery, params);

      // Send Notification to Student
      try {
        const { createNotification } = require('../services/notificationService');
        let title = 'Certificate Borrow Update';
        let message = `Your request to borrow ${reqDetails.certificate_name} has been updated to: ${status.toUpperCase()}.`;
        
        if (remarks) {
          message += `\nRemarks: ${remarks}`;
        }
        if (returnDate && status === 'approved') {
           message += `\nPlease note the approved return date is now: ${new Date(returnDate).toLocaleDateString()}.`;
        }

        await createNotification({
          studentId: reqDetails.student_id,
          title: title,
          message: message,
          category: 'Service'
        });
      } catch (notifErr) {
        console.error('Error sending notification for certificate borrow:', notifErr);
      }

      res.status(200).json({ success: true, message: 'Status updated successfully' });
    } catch (error) {
      console.error('Error updating borrow request status:', error);
      res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
  }
};

module.exports = certificateBorrowController;
