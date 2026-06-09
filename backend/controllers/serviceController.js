const { masterPool } = require("../config/database");
const { buildScopeConditions } = require("../utils/scoping");
const { sendNotificationToUser } = require("./pushController");
const { createNotification } = require("../services/notificationService");
const pdfService = require("../services/pdfService");
const fs = require("fs");
const FeeHead = require('../MongoDb-Models/FeeHead');
const StudentFee = require('../MongoDb-Models/StudentFee');
const Transaction = require('../MongoDb-Models/Transaction');

// --- Services Configuration (Admin) ---

// Get all services (Admin sees all, Students see active only)
exports.getServices = async (req, res) => {
  try {
    const isAdmin =
      req.user &&
      (req.user.role === "admin" ||
        req.user.role === "super_admin" ||
        req.user.isAdmin);
    let query = "SELECT * FROM services";
    const params = [];

    if (!isAdmin) {
      query += " WHERE is_active = TRUE";
    }

    query += " ORDER BY name ASC";

    const [rows] = await masterPool.execute(query, params);

    res.json({
      success: true,
      data: rows,
    });
  } catch (error) {
    console.error("Error fetching services:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.createService = async (req, res) => {
  try {
    const {
      name,
      description,
      price,
      is_active,
      template_type,
      template_config,
      admin_fields,
    } = req.body;

    // Basic validation
    if (!name || price === undefined) {
      return res
        .status(400)
        .json({ success: false, message: "Name and Price are required" });
    }

    const [result] = await masterPool.execute(
      "INSERT INTO services (name, description, price, is_active, template_type, template_config, admin_fields) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [
        name,
        description,
        price,
        is_active !== undefined ? is_active : true,
        template_type || "standard",
        template_config ? JSON.stringify(template_config) : null,
        admin_fields ? JSON.stringify(admin_fields) : null,
      ],
    );

    res.status(201).json({
      success: true,
      message: "Service created successfully",
      serviceId: result.insertId,
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res
        .status(400)
        .json({ success: false, message: "Service name already exists" });
    }
    console.error("Error creating service:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.updateService = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      price,
      is_active,
      template_type,
      template_config,
      admin_fields,
    } = req.body;

    const [result] = await masterPool.execute(
      "UPDATE services SET name = ?, description = ?, price = ?, is_active = ?, template_type = ?, template_config = ?, admin_fields = ? WHERE id = ?",
      [
        name,
        description,
        price,
        is_active,
        template_type || "standard",
        template_config ? JSON.stringify(template_config) : null,
        admin_fields ? JSON.stringify(admin_fields) : null,
        id,
      ],
    );

    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Service not found" });
    }

    res.json({ success: true, message: "Service updated successfully" });
  } catch (error) {
    console.error("Error updating service:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.deleteService = async (req, res) => {
  try {
    const { id } = req.params;
    // Check if used in requests
    const [requests] = await masterPool.execute(
      "SELECT 1 FROM service_requests WHERE service_id = ? LIMIT 1",
      [id],
    );
    if (requests.length > 0) {
      // Soft delete or prevent? Let's just deactivate if used
      await masterPool.execute(
        "UPDATE services SET is_active = FALSE WHERE id = ?",
        [id],
      );
      return res.json({
        success: true,
        message: "Service deactivated (cannot delete as it has requests)",
      });
    }

    const [result] = await masterPool.execute(
      "DELETE FROM services WHERE id = ?",
      [id],
    );

    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Service not found" });
    }

    res.json({ success: true, message: "Service deleted successfully" });
  } catch (error) {
    console.error("Error deleting service:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// --- Service Requests (Student & Admin) ---

// Create Request (Student)
exports.requestService = async (req, res) => {
  try {
    const { service_id, purpose, ...otherData } = req.body;
    const student_id = req.user.id; // User must be a student

    // Verify service exists and is active
    const [service] = await masterPool.execute(
      "SELECT * FROM services WHERE id = ? AND is_active = TRUE",
      [service_id],
    );
    if (service.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid or inactive service" });
    }

    // Store additional request data properly
    const request_data = JSON.stringify({ purpose, ...otherData });

    const [result] = await masterPool.execute(
      "INSERT INTO service_requests (student_id, service_id, status, payment_status, request_data) VALUES (?, ?, ?, ?, ?)",
      [student_id, service_id, "pending", "pending", request_data],
    );

    // --- ACTIVE SYNC: Create StudentFee Demand Immediately ---
    try {
        // 1. Fetch Student Details needed for Fee Record
        const [stRows] = await masterPool.execute(
            'SELECT admission_number, student_name, course, branch, current_year, current_semester, student_data FROM students WHERE id = ?',
            [student_id]
        );
        
        if (stRows.length > 0) {
            const student = stRows[0];
            let collegeName = 'Pydah Group';
            // Try to extract college from student_data if available
            if (student.student_data) {
                try {
                    const sd = typeof student.student_data === 'string' ? JSON.parse(student.student_data) : student.student_data;
                    if (sd.college || sd.College) collegeName = sd.college || sd.College;
                } catch(e) {}
            }

            // 2. Find/Create Fee Head
            let ssFeeHead = await FeeHead.findOne({ code: 'SSF' });
            if (!ssFeeHead) {
                ssFeeHead = await FeeHead.create({
                     name: 'Student Services FEE',
                     code: 'SSF',
                     description: 'Fees For the Student Services',
                     type: 'Individual',
                     frequency: 'Adhoc',
                     isActive: true
                });
            }

            // 3. Create Fee Demand
            const expectedRemarks = `Service Request: ${service[0].name} (Ref: ${result.insertId})`;
            await StudentFee.create({
                 studentId: student.admission_number, // Use Admission Number for Mongo
                 studentName: student.student_name,
                 feeHead: ssFeeHead._id,
                 college: collegeName,
                 course: student.course || 'NA',
                 branch: student.branch || 'NA',
                 academicYear: '2024-2025', 
                 studentYear: student.current_year || 1,
                 semester: student.current_semester || 1,
                 amount: Number(service[0].price),
                 remarks: expectedRemarks
            });
            console.log(`[ACTIVE SYNC] Created Service Fee Demand for ${student.admission_number}: ${service[0].name}`);
        }
    } catch (syncError) {
        console.error('[ACTIVE SYNC WARNING] Failed to create fee demand:', syncError);
        // Don't fail the request, JIT sync will catch it later
    }
    // -------------------------------------------------------

    res.status(201).json({
      success: true,
      message: "Service requested successfully. Please complete payment.",
      requestId: result.insertId,
      payment_status: "pending",
    });
  } catch (error) {
    console.error("Error requesting service:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// DELETE Service Request (Student)
exports.deleteServiceRequest = async (req, res) => {
    try {
        const { id } = req.params;
        const student_id = req.user.id; // Internal ID from auth middleware

        // 1. Fetch Request
        const [requests] = await masterPool.execute(
            'SELECT * FROM service_requests WHERE id = ?',
            [id]
        );

        if (requests.length === 0) {
            return res.status(404).json({ success: false, message: 'Request not found' });
        }

        const request = requests[0];

        // 2. Authorization Check (Must be own request)
        if (request.student_id !== student_id) {
            return res.status(403).json({ success: false, message: 'Unauthorized' });
        }

        // 3. Status Check (Must be pending/pending)
        if (request.status !== 'pending' || request.payment_status === 'paid') {
            return res.status(400).json({ 
                success: false, 
                message: 'Cannot delete processed or paid requests.' 
            });
        }

        // 4. Delete from MySQL
        await masterPool.execute('DELETE FROM service_requests WHERE id = ?', [id]);

        // --- ACTIVE SYNC: Remove StudentFee Demand ---
        try {
             // We need to find the fee with remarks containing "Ref: {id}"
             // And ensuring it's for this student (though Ref ID is unique enough globally or contextually)
             // Getting admission number from user object (assuming req.user populated with it or we need to fetch)
             // But student_id is internal ID. We need admission number for mongo.
             
             // Fetch admission number first? Or we can search loosely if we are confident?
             // Safest is to fetch student admission number using student_id
             const [sRows] = await masterPool.execute('SELECT admission_number FROM students WHERE id = ?', [student_id]);
             if (sRows.length > 0) {
                 const admissionNumber = sRows[0].admission_number;
                 
                 // Find SSF Head
                 const ssFeeHead = await FeeHead.findOne({ code: 'SSF' });
                 if (ssFeeHead) {
                     await StudentFee.findOneAndDelete({
                         studentId: admissionNumber,
                         feeHead: ssFeeHead._id,
                         remarks: { $regex: `Ref: ${id}\\)` } // Matches "(Ref: 123)"
                     });
                     console.log(`[ACTIVE SYNC] Deleted Service Fee Demand for Ref: ${id}`);
                 }
             }
        } catch (syncError) {
             console.error('[ACTIVE SYNC WARNING] Failed to delete fee demand:', syncError);
        }
        // ---------------------------------------------

        res.json({ success: true, message: 'Request deleted successfully' });

    } catch (error) {
        console.error('Error deleting service request:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Create Request (Admin on behalf of Student)
exports.createRequestByAdmin = async (req, res) => {
  try {
    const {
      service_id,
      admission_number,
      purpose,
      // Student Details
      student_name,
      father_name,
      student_mobile,
      course,
      branch,
      current_year,
      current_semester,
      dob,
      gender,
      caste,
      student_address,
      ...otherData
    } = req.body;

    // Validation
    if (!service_id || !admission_number || !student_name) {
      return res.status(400).json({
        success: false,
        message: "Service, Admission Number, and Student Name are required",
      });
    }

    // Check if student exists
    const [students] = await masterPool.execute(
      "SELECT id FROM students WHERE admission_number = ?",
      [admission_number],
    );
    let student_id;

    if (students.length > 0) {
      student_id = students[0].id;
      // Update Student Details
      await masterPool.execute(
        `UPDATE students SET
                    student_name = ?, father_name = ?, student_mobile = ?,
                    course = ?, branch = ?, current_year = ?, current_semester = ?,
                    dob = ?, gender = ?, caste = ?, student_address = ?
                WHERE id = ?`,
        [
          student_name,
          father_name || null,
          student_mobile || null,
          course || null,
          branch || null,
          current_year || null,
          current_semester || null,
          dob || null,
          gender || null,
          caste || null,
          student_address || null,
          student_id,
        ],
      );
    } else {
      // Create New Student
      const [res] = await masterPool.execute(
        `INSERT INTO students (
                    admission_number, student_name, father_name, student_mobile,
                    course, branch, current_year, current_semester,
                    dob, gender, caste, student_address, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          admission_number,
          student_name,
          father_name || null,
          student_mobile || null,
          course || null,
          branch || null,
          current_year || null,
          current_semester || null,
          dob || null,
          gender || null,
          caste || null,
          student_address || null,
        ],
      );
      student_id = res.insertId;
    }

    // Verify service
    const [service] = await masterPool.execute(
      "SELECT * FROM services WHERE id = ?",
      [service_id],
    );
    if (service.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid service" });
    }

    const request_data = JSON.stringify({ purpose, ...otherData });

    // Create request as PAID immediately
    const [result] = await masterPool.execute(
      "INSERT INTO service_requests (student_id, service_id, status, payment_status, request_data, created_at, request_date) VALUES (?, ?, ?, ?, ?, NOW(), NOW())",
      [student.id, service_id, "pending", "paid", request_data],
    );

    res.status(201).json({
      success: true,
      message: "Service request created and marked as paid.",
      requestId: result.insertId,
      // Return context for frontend
      student_name: student_name,
      service_name: service[0].name,
      service_price: service[0].price,
    });
  } catch (error) {
    console.error("Error creating admin request:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Get Requests
exports.getServiceRequests = async (req, res) => {
  try {
    const { status, student_id } = req.query;
    const isStudent =
      req.user.role === "student" || (!req.user.isAdmin && !req.user.role); // Assuming simplified role check

    // Build query
    let query = `
      SELECT sr.*, s.name as service_name, s.price as service_price, s.admin_fields,
             st.student_name, st.admission_number, st.course, st.branch, st.student_mobile
      FROM service_requests sr
      JOIN services s ON sr.service_id = s.id
      JOIN students st ON sr.student_id = st.id
    `;

    const params = [];
    const conditions = [];

    // If student, only show their requests
    if (isStudent || student_id) {
      // Allow admin to filter by student_id
      // If isStudent is true, force student_id to be logged in user
      const targetId = isStudent ? req.user.id : student_id;
      conditions.push("sr.student_id = ?");
      params.push(targetId);
    }

    if (status) {
      conditions.push("sr.status = ?");
      params.push(status);
    }

    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }

    // Apply Scope Filtering (for admins)
    if (!isStudent && req.userScope) {
      const { conditions: scopeConditions, params: scopeParams } =
        buildScopeConditions(req.userScope, "st");
      if (scopeConditions.length > 0) {
        // If WHERE clause exists, append with AND, else start with WHERE
        query +=
          (query.includes("WHERE") ? " AND " : " WHERE ") +
          scopeConditions.join(" AND ");
        params.push(...scopeParams);
      }
    }

    query += " ORDER BY sr.request_date DESC";

    const [rows] = await masterPool.execute(query, params);

    // --- SMART SYNC: Check Payment Status against Fee Ledger ---
    // This allows external/manual payments to auto-update the request status
    try {
        const pendingRequests = rows.filter(r => r.payment_status === 'pending');
        
        if (pendingRequests.length > 0) {
            const ssFeeHead = await FeeHead.findOne({ code: 'SSF' });
            
            if (ssFeeHead) {
                // We'll check each pending request
                const updates = pendingRequests.map(async (req) => {
                    // Find the fee demand for this specific request
                    // We need strict matching on Ref ID
                    const feeRecord = await StudentFee.findOne({
                        studentId: req.admission_number, // Ensure admission_number is fetched in the query
                        feeHead: ssFeeHead._id,
                        remarks: { $regex: `Ref: ${req.id}` } // Matches "...(Ref: 123)..."
                    });

                    if (feeRecord) {
                        // Calculate total paid for this fee
                        // We need transactions for this specific fee record
                        // Or if we trust the feeRecord.paidAmount if you have an aggregated field (assuming NO aggregated field in schema based on previous files)
                        // We must sum transactions.
                        const transactions = await Transaction.find({
                            studentId: req.admission_number,
                            feeHead: ssFeeHead._id,
                            studentYear: feeRecord.studentYear,
                            // Strict match on remarks for this transaction to avoid club/other mixups? 
                            // Actually, feeController usually links tx to fee details. 
                            // But simplify: If existing logic worked, we just sum credits.
                            // BUT wait, `StudentFee` doesn't track paid amount directly usually? 
                            // Let's assume we need to sum transactions.
                        });

                        // Filter transactions that strictly match THIS service request Ref ID
                        // This prevents cross-paying other service requests
                        const relevantTxs = transactions.filter(tx => 
                            tx.remarks && (tx.remarks.includes(`Ref: ${req.id}`) || tx.remarks.includes(`SR-${req.id}`))
                        );
                        
                        const totalPaid = relevantTxs.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
                        const due = feeRecord.amount - totalPaid;

                        if (due <= 0) {
                           // It's PAID!
                           // 1. Update MySQL
                           await masterPool.execute(
                               'UPDATE service_requests SET payment_status = ? WHERE id = ?',
                               ['paid', req.id]
                           );
                           // 2. Update Local Object so Admin sees it immediately
                           req.payment_status = 'paid';
                           console.log(`[AUTO-SYNC] Marked Service Request #${req.id} as PAID based on Fee Ledger.`);
                        }
                    }
                });

                await Promise.all(updates);
            }
        }
    } catch (syncError) {
        console.error('[AUTO-SYNC WARNING] Failed to sync payments:', syncError);
        // Fail gracefully, return rows as is
    }
    // -----------------------------------------------------------

    res.json({
      success: true,
      data: rows,
    });
  } catch (error) {
    console.error("Error fetching service requests:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Update Request Status (Admin)
exports.updateRequestStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, collect_date, admin_note, ...otherUpdates } = req.body;

    // Fetch current request data to merge JSON, and get student/service info for notification
    const [existing] = await masterPool.execute(
      "SELECT sr.request_data, sr.student_id, s.name as service_name FROM service_requests sr LEFT JOIN services s ON sr.service_id = s.id WHERE sr.id = ?",
      [id],
    );

    if (existing.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Request not found" });
    }

    let currentData = existing[0].request_data;
    // Parse if string
    if (typeof currentData === "string") {
      try {
        currentData = JSON.parse(currentData);
      } catch (e) {
        currentData = {};
      }
    }

    // Merge legitimate extra fields that shouldn't be top-level columns
    // Merge extra fields into request_data
    // We now allow any extra fields sent from the frontend dynamic form
    const predefinedFields = ["status", "collect_date", "admin_note"];
    let hasDataUpdate = false;

    Object.keys(otherUpdates).forEach((key) => {
      if (!predefinedFields.includes(key)) {
        currentData[key] = otherUpdates[key];
        hasDataUpdate = true;
      }
    });

    let query = "UPDATE service_requests SET status = ?";
    const params = [status];

    if (collect_date) {
      query += ", collect_date = ?";
      params.push(collect_date);
    }

    if (admin_note) {
      query += ", admin_note = ?";
      params.push(admin_note);
    }

    if (hasDataUpdate) {
      query += ", request_data = ?";
      params.push(JSON.stringify(currentData));
    }

    query += " WHERE id = ?";
    params.push(id);

    const [result] = await masterPool.execute(query, params);

    // Send Push Notification
    if (existing[0] && existing[0].student_id) {
      const studentId = existing[0].student_id;
      const serviceName = existing[0].service_name || "Service Request";

      // Async send (don't await)
      sendNotificationToUser(studentId, {
        title: "Service Update",
        body: `Your request for ${serviceName} is now ${status}.`,
        icon: "/icon-192x192.png",
        data: {
          url: "/student/services",
        },
      }).catch((e) => console.error("Service notification failed:", e));

      // Send Web Notification
      createNotification({
        studentId: studentId,
        title: "Service Request Update",
        message: `Your request for ${serviceName || "Service"} is now ${status}.`,
        category: "Service",
        data: { requestId: id, url: "/student/services" },
      }).catch((e) => console.error("Web notification failed:", e));
    }

    res.json({ success: true, message: "Request updated successfully" });
  } catch (error) {
    console.error("Error updating request:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Mock Payment Process
// Mark Payment as Received (Admin/Staff)
exports.processPayment = async (req, res) => {
  try {
    const { request_id } = req.body;

    // Ensure user is admin (or handled by middleware)
    const isAdmin =
      req.user &&
      (req.user.role === "admin" ||
        req.user.role === "super_admin" ||
        req.user.isAdmin);
    if (!isAdmin) {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    const [requests] = await masterPool.execute(
      "SELECT * FROM service_requests WHERE id = ?",
      [request_id],
    );

    if (requests.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Request not found" });
    }

    // Mark as paid
    await masterPool.execute(
      "UPDATE service_requests SET payment_status = 'paid' WHERE id = ?",
      [request_id],
    );

    res.json({
      success: true,
      message: "Payment marked as received",
      status: "paid",
    });
  } catch (error) {
    console.error("Error in payment:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Download Certificate
exports.downloadCertificate = async (req, res) => {
  try {
    const { id } = req.params; // request id
    const student_id = req.user.id;
    const isAdmin =
      req.user.role === "admin" ||
      req.user.role === "super_admin" ||
      req.user.isAdmin;

    // Fetch request with service and student details
    const query = `
            SELECT sr.*, s.name as service_name, s.template_type, s.template_config, st.*,
            c.name as college_name, c.metadata as college_metadata, c.address as college_address
            FROM service_requests sr
            JOIN services s ON sr.service_id = s.id
            JOIN students st ON sr.student_id = st.id
            LEFT JOIN colleges c ON st.college COLLATE utf8mb4_unicode_ci = c.name
            WHERE sr.id = ?
        `;

    const [rows] = await masterPool.execute(query, [id]);

    if (rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Request not found" });
    }

    const request = rows[0];

    // Access Check
    if (!isAdmin && request.student_id !== student_id) {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    // Payment Check
    if (request.payment_status !== "paid" && !isAdmin) {
      return res
        .status(400)
        .json({ success: false, message: "Payment not completed" });
    }

    // Parse request_data safely
    if (typeof request.request_data === "string") {
      try {
        request.request_data = JSON.parse(request.request_data);
      } catch (e) {}
    }

    // Parse college metadata
    let collegeDetails = {
      name: request.college_name || "College",
      phone: "",
      website: "",
      address: request.college_address || "",
    };
    if (request.college_metadata) {
      try {
        const meta =
          typeof request.college_metadata === "string"
            ? JSON.parse(request.college_metadata)
            : request.college_metadata;
        collegeDetails = { ...collegeDetails, ...meta };
      } catch (e) {}
    }
    if (request.college_address && !collegeDetails.address) {
      collegeDetails.address = request.college_address;
    }

    // Generate PDF based on template type
    if (
      request.template_type === "study_certificate" ||
      request.service_name.toLowerCase().includes("study")
    ) {
      filePath = await pdfService.generateStudyCertificate(
        request,
        request,
        collegeDetails,
      ); // passing request as student object because it contains joined fields
    } else if (
      request.template_type === "refund_application" ||
      request.service_name.toLowerCase().includes("refund")
    ) {
      filePath = await pdfService.generateRefundApplication(
        request,
        request,
        collegeDetails,
      );
    } else if (request.template_type === "custodian_certificate") {
      filePath = await pdfService.generateCustodianCertificate(
        request,
        request,
        collegeDetails,
      );
    } else if (request.template_type === "dynamic" && request.template_config) {
      let config = request.template_config;
      if (typeof config === "string") {
        try {
          config = JSON.parse(config);
        } catch (e) {
          config = {};
        }
      }

      // Check if it's the three-section format or element-based format
      if (
        config.top_content ||
        config.middle_content ||
        config.bottom_content
      ) {
        // Process variables for the three sections
        const studentData = {
          ...request,
          ...request.request_data,
          ...collegeDetails,
        };
        const replaceVariables = (text) => {
          if (!text) return "";
          // First handle {{variable}} syntax
          let processed = text.replace(/{{(.*?)}}/g, (match, p1) => {
            const key = p1.trim();
            return studentData[key] !== undefined ? studentData[key] : match;
          });
          // Then handle @[label](variable) or @variable syntax
          processed = processed.replace(/@\[.*?\]\((.*?)\)/g, (match, p1) => {
            return studentData[p1] !== undefined ? studentData[p1] : match;
          });
          processed = processed.replace(/@(\w+)/g, (match, p1) => {
            return studentData[p1] !== undefined ? studentData[p1] : match;
          });
          return processed;
        };

        const processedContent = {
          topContent: replaceVariables(config.top_content),
          middleContent: replaceVariables(config.middle_content),
          bottomContent: replaceVariables(config.bottom_content),
        };

        filePath = await pdfService.generateTemplatedCertificate(
          config,
          processedContent,
          request,
          collegeDetails,
        );
      } else {
        filePath = await pdfService.generateDynamicCertificate(
          request,
          request,
          collegeDetails,
          config,
        );
      }
    } else {
      // Default or throw
      return res.status(400).json({
        success: false,
        message:
          "Certificate template not implemented or config missing for this service",
      });
    }

    // Send file as inline preview (for printing)
    res.sendFile(
      filePath,
      {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="Certificate_${request.admission_number || "document"}.pdf"`,
        },
      },
      (err) => {
        if (err) console.error("Error sending file:", err);
        // Cleanup
        setTimeout(() => {
          try {
            fs.unlinkSync(filePath);
          } catch (e) {}
        }, 5000); // 5s should be enough for browser to buffer
      },
    );
  } catch (error) {
    console.error("Error downloading certificate:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Preview Template (Admin)
exports.previewTemplate = async (req, res) => {
  try {
    const { template_type, service_name } = req.body;
    const isAdmin =
      req.user.role === "admin" ||
      req.user.role === "super_admin" ||
      req.user.isAdmin;

    if (!isAdmin) {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    // Blank Student Data (for template structure preview)
    const blankStudent = {
      student_name: "{{student_name}}",
      admission_number: "{{admission_number}}",
      father_name: "{{parent_name}}", // Mapping to parent_name as requested
      current_year: "{{current_year}}",
      current_semester: "{{current_semester}}",
      course: "{{course}}",
      branch: "{{branch}}",
      student_mobile: "{{student_mobile}}",
      parent_mobile1: "{{parent_mobile}}",
      academic_year: "{{academic_year}}",
      pin_no: "{{pin_no}}",
      dob: "{{dob}}",
      email: "{{email}}",
      religion: "{{religion}}",
      caste: "{{caste}}",
      gender: "{{gender}}",
      admission_date: "{{admission_date}}",
      serial_no: "{{serial_no}}",
      mole_1: "{{mole_1}}",
      mole_2: "{{mole_2}}",
      conduct: "{{conduct}}",
      date_of_leaving: "{{date_of_leaving}}",
      promoted: "{{promoted}}",
      date: new Date().toLocaleDateString(),
      college_name: "Pydah College of Engineering",
    };

    // Blank Request Data
    const blankRequest = {
      request_data: JSON.stringify({
        purpose: "Passport Verification",
        reason: "Personal",
        excess_amount: "5000",
        amount_in_words: "Five Thousand",
        payment_mode: "Cash",
        custody_list: "S.S.C Certificate, Diploma Certificate",
      }),
      admission_number: "",
    };

    // Fetch Actual College Details
    let collegeDetails = {
      name: "Pydah College of Engineering",
      phone: "0884-2315333",
      website: "www.pydah.edu.in",
    };

    let config = req.body.template_config || {};
    if (typeof config === "string") {
      try {
        config = JSON.parse(config);
      } catch (e) {
        config = {};
      }
    }

    try {
      let target;
      if (config.college_id) {
        const [specCollege] = await masterPool.execute(
          "SELECT * FROM colleges WHERE id = ?",
          [config.college_id],
        );
        if (specCollege.length > 0) target = specCollege[0];
      }

      if (!target) {
        const [colleges] = await masterPool.execute(
          "SELECT * FROM colleges WHERE is_active = 1",
        );
        if (colleges.length > 0) {
          target =
            colleges.find((c) =>
              c.name.includes("Pydah College of Engineering"),
            ) || colleges[0];
        }
      }

      if (target) {
        collegeDetails.name = target.name;
        collegeDetails.college_name = target.name;
        if (target.address) {
          collegeDetails.address = target.address;
        }
        if (target.metadata) {
          const meta =
            typeof target.metadata === "string"
              ? JSON.parse(target.metadata)
              : target.metadata;
          collegeDetails = { ...collegeDetails, ...meta };
        }
        // Add image URLs and binary data for templated certificate
        if (target.header_image_url)
          collegeDetails.header_image_url = target.header_image_url;
        if (target.footer_image_url)
          collegeDetails.footer_image_url = target.footer_image_url;
        if (target.header_image)
          collegeDetails.header_image = target.header_image;
        if (target.footer_image)
          collegeDetails.footer_image = target.footer_image;
      }
    } catch (e) {
      console.warn("Could not fetch college details for preview", e);
    }

    let filePath;
    const type = template_type || "";
    const name = service_name || "";

    // Check if dynamic
    if (type === "dynamic") {
      // Check if it's the three-section format or element-based format
      if (
        config.top_content ||
        config.middle_content ||
        config.bottom_content
      ) {
        // Process variables
        const data = {
          ...blankStudent,
          ...JSON.parse(blankRequest.request_data),
          ...collegeDetails,
        };
        const replaceVariables = (text) => {
          if (!text) return "";
          // First handle ___ (three underscores) as input field placeholders
          let processed = text.replace(/___/g, "________________"); // Convert to underlined space

          // Then handle {{variable}} syntax
          processed = processed.replace(/{{(.*?)}}/g, (match, p1) => {
            const key = p1.trim();
            return data[key] !== undefined ? data[key] : match;
          });
          // Then handle @[label](variable) or @variable syntax
          processed = processed.replace(/@\[.*?\]\((.*?)\)/g, (match, p1) => {
            return data[p1] !== undefined ? data[p1] : match;
          });
          processed = processed.replace(/@(\w+)/g, (match, p1) => {
            return data[p1] !== undefined ? data[p1] : match;
          });
          return processed;
        };

        const processedContent = {
          topContent: replaceVariables(config.top_content),
          middleContent: replaceVariables(config.middle_content),
          bottomContent: replaceVariables(config.bottom_content),
        };

        // Merge image URLs into config for the generator
        const enrichedConfig = {
          ...config,
          header_image_url: collegeDetails.header_image_url,
          footer_image_url: collegeDetails.footer_image_url,
        };

        filePath = await pdfService.generateTemplatedCertificate(
          enrichedConfig,
          processedContent,
          blankStudent,
          collegeDetails,
        );
      } else {
        filePath = await pdfService.generateDynamicCertificate(
          blankStudent,
          blankRequest,
          collegeDetails,
          config,
        );
      }
    } else if (
      type === "study_certificate" ||
      name.toLowerCase().includes("study")
    ) {
      filePath = await pdfService.generateStudyCertificate(
        blankStudent,
        blankRequest,
        collegeDetails,
      );
    } else if (
      type === "refund_application" ||
      name.toLowerCase().includes("refund")
    ) {
      filePath = await pdfService.generateRefundApplication(
        blankStudent,
        blankRequest,
        collegeDetails,
      );
    } else if (type === "custodian_certificate") {
      filePath = await pdfService.generateCustodianCertificate(
        blankStudent,
        blankRequest,
        collegeDetails,
      );
    } else if (type === "dynamic" && req.body.template_config) {
      let config = req.body.template_config;
      if (typeof config === "string") {
        try {
          config = JSON.parse(config);
        } catch (e) {
          config = {};
        }
      }
      filePath = await pdfService.generateDynamicCertificate(
        blankStudent,
        blankRequest,
        collegeDetails,
        config,
      );
    } else {
      return res.status(400).json({
        success: false,
        message: "Preview not available for this template type",
      });
    }

    res.sendFile(
      filePath,
      {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="Preview_${type}.pdf"`,
        },
      },
      (err) => {
        if (err) console.error("Error sending file:", err);
        setTimeout(() => {
          try {
            fs.unlinkSync(filePath);
          } catch (e) {}
        }, 5000);
      },
    );
  } catch (error) {
    console.error("Error creating preview:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
