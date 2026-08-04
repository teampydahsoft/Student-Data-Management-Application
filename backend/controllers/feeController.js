const FeeHead = require('../MongoDb-Models/FeeHead');
const StudentFee = require('../MongoDb-Models/StudentFee');
const FeeStructure = require('../MongoDb-Models/FeeStructure'); // Added FeeStructure
const Transaction = require('../MongoDb-Models/Transaction');
const mongoose = require('mongoose');
const { masterPool } = require('../config/database'); // Import MySQL pool

// Helper to format currency
const formatCurrency = (amount) => {
  return Number(amount || 0).toFixed(2);
};

// Get Filter Options for Fee Dashboard
exports.getFilterOptions = async (req, res) => {
  try {
    const academicYears = await StudentFee.distinct('academicYear');
    const colleges = await StudentFee.distinct('college');
    const courses = await StudentFee.distinct('course');
    const branches = await StudentFee.distinct('branch');

    res.json({
      success: true,
      filters: {
        academicYears,
        colleges,
        courses,
        branches
      }
    });
  } catch (error) {
    console.error('Error fetching filter options:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch filter options' });
  }
};

// Get All Fee Headers
exports.getFeeHeaders = async (req, res) => {
  try {
    const headers = await FeeHead.find().sort({ name: 1 });
    res.json({ success: true, headers });
  } catch (error) {
    console.error('Error fetching fee headers:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch fee headers' });
  }
};

// Create a new Fee Header
exports.createFeeHeader = async (req, res) => {
  try {
    const { name, code, description } = req.body;
    
    const existing = await FeeHead.findOne({ $or: [{ name }, { code }] });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Fee Head with this name or code already exists' });
    }

    const newHeader = new FeeHead({ name, code, description });
    await newHeader.save();

    res.status(201).json({ success: true, header: newHeader, message: 'Fee Head created successfully' });
  } catch (error) {
    console.error('Error creating fee header:', error);
    res.status(500).json({ success: false, message: 'Failed to create fee header' });
  }
};

// Update Fee Header
exports.updateFeeHeader = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, code, description } = req.body;

    const updatedHeader = await FeeHead.findByIdAndUpdate(
      id,
      { name, code, description },
      { new: true, runValidators: true }
    );

    if (!updatedHeader) {
      return res.status(404).json({ success: false, message: 'Fee Head not found' });
    }

    res.json({ success: true, header: updatedHeader, message: 'Fee Head updated successfully' });
  } catch (error) {
    console.error('Error updating fee header:', error);
    res.status(500).json({ success: false, message: 'Failed to update fee header' });
  }
};

// Delete Fee Header
exports.deleteFeeHeader = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if used in StudentFee
    const usageCount = await StudentFee.countDocuments({ feeHead: id });
    if (usageCount > 0) {
      return res.status(400).json({ success: false, message: 'Cannot delete Fee Head as it is assigned to students' });
    }

    const deleted = await FeeHead.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Fee Head not found' });
    }

    res.json({ success: true, message: 'Fee Head deleted successfully' });
  } catch (error) {
    console.error('Error deleting fee header:', error);
    res.status(500).json({ success: false, message: 'Failed to delete fee header' });
  }
};

// Get Students with Fee Summary
exports.getStudentsWithFees = async (req, res) => {
  try {
    const { page = 1, limit = 10, college, course, branch, academicYear, search } = req.query;
    const skip = (page - 1) * limit;

    const pipeline = [];

    // Match filters
    const matchStage = {};
    if (college) matchStage.college = college;
    if (course) matchStage.course = course;
    if (branch) matchStage.branch = branch;
    if (academicYear) matchStage.academicYear = academicYear;
    if (search) {
      matchStage.$or = [
        { studentName: { $regex: search, $options: 'i' } },
        { studentId: { $regex: search, $options: 'i' } }
      ];
    }

    if (Object.keys(matchStage).length > 0) {
      pipeline.push({ $match: matchStage });
    }

    // Group by student to calculate totals
    pipeline.push({
      $group: {
        _id: '$studentId',
        studentName: { $first: '$studentName' },
        college: { $first: '$college' },
        course: { $first: '$course' },
        branch: { $first: '$branch' },
        academicYear: { $first: '$academicYear' }, // Simplification: taking first found
        totalFee: { $sum: '$amount' }
      }
    });

    // Pagination facet
    const facetPipeline = [
      {
        $facet: {
          metadata: [{ $count: "total" }],
          data: [{ $skip: parseInt(skip) }, { $limit: parseInt(limit) }]
        }
      }
    ];

    pipeline.push(...facetPipeline);

    const result = await StudentFee.aggregate(pipeline);
    const studentsData = result[0].data;
    const totalCount = result[0].metadata[0] ? result[0].metadata[0].total : 0;

    // Fetch payments for these students to calculate paid/due
    const studentIds = studentsData.map(s => s._id);
    const payments = await Transaction.aggregate([
      { $match: { studentId: { $in: studentIds }, transactionType: 'DEBIT' } }, // DEBIT is payment
      { $group: { _id: '$studentId', totalPaid: { $sum: '$amount' } } }
    ]);

    const paymentsMap = {};
    payments.forEach(p => {
      paymentsMap[p._id] = p.totalPaid;
    });

    const formattedStudents = studentsData.map(student => {
      const paid = paymentsMap[student._id] || 0;
      return {
        studentId: student._id,
        name: student.studentName,
        college: student.college,
        course: student.course,
        branch: student.branch,
        totalFee: student.totalFee,
        paidAmount: paid,
        dueAmount: student.totalFee - paid
      };
    });

    res.json({
      success: true,
      students: formattedStudents,
      pagination: {
        total: totalCount,
        page: parseInt(page),
        pages: Math.ceil(totalCount / limit)
      }
    });

  } catch (error) {
    console.error('Error fetching students with fees:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch students' });
  }
};

// Get Detailed Fee Info for a Single Student
// UPDATED: Now fetches student details from SQL and FeeStructure from MongoDB
exports.getStudentFeeDetails = async (req, res) => {
  try {
    const { studentId } = req.params;

    // 1. Fetch Student Details from SQL
    // We need course, branch, batch (admission_year), student_data (for college)
    // Note: custom_fields column might not exist, so we use student_data
    const [students] = await masterPool.query(
      `SELECT 
         s.student_name, s.course, s.branch, s.batch, s.current_year, s.current_semester, s.student_data
       FROM students s LEFT JOIN colleges ON s.college_id = colleges.id LEFT JOIN courses ON s.course_id = courses.id LEFT JOIN course_branches ON s.branch_id = course_branches.id
       WHERE s.admission_number = ?`,
      [studentId]
    );

    if (!students || students.length === 0) {
      return res.status(404).json({ success: false, message: 'Student not found in database' });
    }

    const student = students[0];
    
    // Try to determine college from student_data
    let collegeName = 'Pydah Group'; // Default fallback
    
    // Check key fields directly if columns exist (not in schema but just in case) or look into student_data
    if (student.student_data) {
        try {
            const sd = typeof student.student_data === 'string' ? JSON.parse(student.student_data) : student.student_data;
            if (sd.college) collegeName = sd.college;
            else if (sd.College) collegeName = sd.College;
        } catch (e) {
            console.error('Error parsing student_data:', e);
        }
    }

    // 2. Fetch Applicable Fee Structures
    // We look for structures matching the student's Course, Branch, Batch and Student Year
    // If 'semester' is defined in fee structure, we only apply if it matches current semester OR we presume all past semesters of current year are due?
    // Usually, we want ALL fees applicable to the student for their current year + past yeaars?
    // Or just the current year's fees?
    // "Fetch the fees correctly" -> implies current total liability.
    
    // Let's fetch ALL applicable fee structures for this batch, course, branch up to the current year.
    // --- JIT CLUB FEE SYNC ---
    try {
        // A. Get approved memberships for this student
        // We know admission_number (studentId), but club_members uses internal ID.
        // We actually fetched 'student' record from SQL above, which has 'id'? No, we selected specific columns.
        // Let's fetch internal ID if we didn't get it.
        // The previous query was: SELECT s.student_name ... FROM students ...
        // Let's rely on a separate query to be safe or modify the top one. 
        // For minimal impact, separate lightweight query:
        const [sRow] = await masterPool.query('SELECT id FROM students WHERE admission_number = ?', [studentId]);
        
        if (sRow.length > 0) {
            const internalStudentId = sRow[0].id;
            
            // B. Fetch Approved Clubs with Fee > 0
            const [approvedClubs] = await masterPool.query(`
                SELECT c.name, c.membership_fee 
                FROM club_members cm
                JOIN clubs c ON cm.club_id = c.id
                WHERE cm.student_id = ? AND cm.status = 'approved' AND c.membership_fee > 0
            `, [internalStudentId]);

            if (approvedClubs.length > 0) {
                 // C. Find "Club Fee" Head
                 let feeHead = await FeeHead.findOne({ name: 'Club Fee' });
                 if (!feeHead) {
                     // Auto-create if missing (Self-healing)
                     feeHead = await FeeHead.create({
                         name: 'Club Fee',
                         code: 'CF',
                         description: 'Fee for club memberships',
                         type: 'Individual',
                         frequency: 'One-time',
                         isActive: true
                     });
                 }

                 // D. Sync Check
                 for (const club of approvedClubs) {
                     const expectedRemarks = `Club Fee: ${club.name}`;
                     
                     // Check if fee exists
                     const exists = await StudentFee.exists({
                         studentId: studentId, // Admission Number
                         feeHead: feeHead._id,
                         remarks: expectedRemarks
                     });

                     if (!exists) {
                         await StudentFee.create({
                             studentId: studentId,
                             studentName: student.student_name || 'Student',
                             feeHead: feeHead._id,
                             college: collegeName || 'NA',
                             course: student.course || 'NA',
                             branch: student.branch || 'NA',
                             academicYear: '2024-2025', // Should ideally come from somewhere constant
                             studentYear: student.current_year || 1,
                             semester: student.current_semester || 1,
                             amount: Number(club.membership_fee),
                             remarks: expectedRemarks
                         });
                         console.log(`[JIT SYNC] Created Club Fee for ${studentId}: ${club.name}`);
                     }
                 }
            }
        }
    } catch (jitError) {
        console.error('[JIT Error] Failed to sync club fees:', jitError);
        // Continue execution - do not fail the whole request
    }
    // -------------------------
    // --- JIT SERVICE REQUEST SYNC (Refined) ---
    // Rule: Request = Due (Demand). Payment = Transaction. Request Deleted = Due Deleted.
    try {
        // A. Fetch ALL Active Service Requests for this student
        let internalStudentId = null;
        if (typeof sRow !== 'undefined' && sRow.length > 0) {
            internalStudentId = sRow[0].id;
        } else {
             const [sRowNow] = await masterPool.query('SELECT id FROM students WHERE admission_number = ?', [studentId]);
             if (sRowNow.length > 0) internalStudentId = sRowNow[0].id;
        }

        if (internalStudentId) {
             const [allRequests] = await masterPool.query(`
                SELECT sr.id, sr.service_id, sr.payment_status, sr.status, s.name, s.price 
                FROM service_requests sr
                JOIN services s ON sr.service_id = s.id
                WHERE sr.student_id = ? 
            `, [internalStudentId]);

             // B. Find "Student Services FEE" Head
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

             const activeRequestIds = new Set();

             // C. Sync Each Request (Create Demand & Transaction if needed)
             for (const req of allRequests) {
                 activeRequestIds.add(req.id);
                 const expectedRemarks = `Service Request: ${req.name} (Ref: ${req.id})`;
                 
                 // 1. Check/Create Demand (Due)
                 // We simply check if it exists.
                 const feeExists = await StudentFee.exists({
                     studentId: studentId,
                     feeHead: ssFeeHead._id,
                     remarks: expectedRemarks
                 });

                 if (!feeExists) {
                     await StudentFee.create({
                         studentId: studentId,
                         studentName: student.student_name || 'Student',
                         feeHead: ssFeeHead._id,
                         college: collegeName || 'NA',
                         course: student.course || 'NA',
                         branch: student.branch || 'NA',
                         academicYear: '2024-2025', 
                         studentYear: student.current_year || 1,
                         semester: student.current_semester || 1,
                         amount: Number(req.price),
                         remarks: expectedRemarks
                     });
                     console.log(`[JIT SYNC] Created Service Fee Demand for ${studentId}: ${req.name}`);
                 }

                 // 2. Check/Create Transaction (Payment) ONLY if paid
                 // 2. CHECK & SYNC TRANSACTIONS (Robust Deduplication)
                 if (req.payment_status === 'paid') {
                     // Robust Search: Find ANY transaction related to this Request ID
                     // Matches: referenceNo "SR-123" OR remarks containing "Ref: 123"
                     // We use a regex for the remarks to cover various formats
                     const relatedTxs = await Transaction.find({
                        studentId: studentId,
                        feeHead: ssFeeHead._id,
                        $or: [
                            { referenceNo: `SR-${req.id}` },
                            { remarks: { $regex: new RegExp(`Ref:\\s*${req.id}`, 'i') } }
                        ]
                     });

                     let realPayment = null;
                     let syncedPayment = null;

                     relatedTxs.forEach(tx => {
                         if (tx.collectedBy === 'system_sync' || (tx.remarks && tx.remarks.includes('- Synced'))) {
                             syncedPayment = tx;
                         } else {
                             realPayment = tx;
                         }
                     });

                     if (realPayment && syncedPayment) {
                         // DUPLICATE DETECTED: We have a real payment (Razorpay/Cash) AND a Synced one.
                         // Delete the Synced one to fix the "Double Count / Adjustment" issue.
                         await Transaction.findByIdAndDelete(syncedPayment._id);
                         console.log(`[JIT SYNC] Removed duplicate 'Synced' transaction for Ref: ${req.id} (Real payment exists)`);
                     } else if (!realPayment && !syncedPayment) {
                         // MISSING: Payment is marked 'paid' in SQL but no Transaction in Mongo.
                         // Create 'Synced' transaction.
                         // NOTE: Use 'Net Banking' to avoid Frontend treating it as 'Adjustment' (Credit/+).
                         await Transaction.create({
                             studentId: studentId,
                             studentName: student.student_name,
                             amount: Number(req.price),
                             transactionType: 'DEBIT',
                             paymentMode: 'Net Banking', // Avoid 'Adjustment'
                             referenceNo: `SR-${req.id}`,
                             remarks: `Service Request Payment: ${req.name} (Ref: ${req.id}) - Synced`,
                             feeHead: ssFeeHead._id,
                             studentYear: (student.current_year || 1).toString(),
                             semester: (student.current_semester || 1).toString(),
                             paymentDate: new Date(),
                             collectedBy: 'system_sync',
                             collectedByName: 'System JIT Sync'
                         });
                         console.log(`[JIT SYNC] Created Payment Transaction for ${studentId}: ${req.name}`);
                     }
                 }
             }

             // D. Cleanup Orphaned Fees (Request Deleted -> Due Deleted)
             // Fetch all SSF fees for this student
             const existingServiceFees = await StudentFee.find({
                 studentId: studentId,
                 feeHead: ssFeeHead._id
             });

             for (const fee of existingServiceFees) {
                 // Extract Request ID from remarks "Service Request: ... (Ref: 123)"
                 const match = fee.remarks.match(/\(Ref: (\d+)\)/);
                 if (match && match[1]) {
                     const refId = parseInt(match[1]);
                     if (!activeRequestIds.has(refId)) {
                         // This fee corresponds to a request that no longer exists in MySQL
                         await StudentFee.findByIdAndDelete(fee._id);
                         console.log(`[JIT SYNC] Deleted Orphaned Service Fee for ${studentId} (Ref: ${refId})`);
                     }
                 }
             }
        }
    } catch (jitError) {
        console.error('[JIT Error] Failed to sync service fees:', jitError);
    }
    // -------------------------

    const query = {
      course: student.course,
      branch: student.branch,
      batch: student.batch,
      studentYear: { $lte: student.current_year } // Fees for current and past years
    };
    
    // If college is available in student table, add it.
    // query.college = collegeName; // Uncomment if strictly filtering by college

    const feeStructures = await FeeStructure.find(query).populate('feeHead');

    // 3. Fetch Transactions
    // 3. Fetch Transactions
    // Use regex to be case-insensitive with studentId
    const transactions = await Transaction.find({ 
      studentId: { $regex: new RegExp(`^${studentId}$`, 'i') } 
    }).sort({ paymentDate: -1 }).populate('feeHead');

    // 4. Calculate Totals
    // 4. Calculate Totals
    let totalFee = 0;
    const feesList = [];

    // Fetch individual fees first to check for overrides
    // Use regex for case-insensitive match
    const individualFees = await StudentFee.find({ 
        studentId: { $regex: new RegExp(`^${studentId}$`, 'i') } 
    }).populate('feeHead');

    // Create a set of keys for existing individual fees to avoid duplicates
    // Key format: feeHeadId-studentYear-semester
    const individualFeeKeys = new Set();
    individualFees.forEach(f => {
        if (f.feeHead && f.feeHead._id) {
            // Normalize semester: treat null/undefined as '0' or 'none'
            const sem = f.semester ? f.semester.toString() : '0';
            const key = `${f.feeHead._id.toString()}-${f.studentYear}-${sem}`;
            individualFeeKeys.add(key);
        }
    });

    // Add Fee Structures ONLY if not overridden by an individual fee
    feeStructures.forEach(fs => {
        if (fs.feeHead && fs.feeHead._id) {
             const sem = fs.semester ? fs.semester.toString() : '0';
             const key = `${fs.feeHead._id.toString()}-${fs.studentYear}-${sem}`;
             
             // Check if this specific fee structure is already "covered" by an individual fee
             if (!individualFeeKeys.has(key)) {
                totalFee += fs.amount;
                feesList.push({
                    _id: fs._id,
                    feeHead: fs.feeHead,
                    amount: fs.amount,
                    studentYear: fs.studentYear,
                    semester: fs.semester,
                    remarks: fs.description || 'Fee Structure',
                    isStructure: true
                });
             }
        }
    });

    // Add Individual Fees
    individualFees.forEach(f => {
        totalFee += f.amount;
        feesList.push(f);
    });

    let totalPaid = 0;
    transactions.forEach(t => {
      // Ensure amount is a number
      const amount = Number(t.amount) || 0;
      // Inverted Logic: DEBIT is used for Payments made by student
      if (t.transactionType === 'DEBIT') {
        totalPaid += amount;
      } else if (t.transactionType === 'CREDIT') {
        totalPaid -= amount;
      }
    });

    const dueAmount = totalFee - totalPaid;

    res.json({
      success: true,
      studentId,
      studentDetails: {
          name: student.student_name,
          course: student.course,
          branch: student.branch,
          batch: student.batch,
          currentYear: student.current_year,
          currentSemester: student.current_semester
      },
      summary: {
        totalFee,
        totalPaid,
        dueAmount
      },
      fees: feesList, // Now contains both Structure fees and Individual fees
      transactions
    });

  } catch (error) {
    console.error('Error fetching student fee details:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch student fee details' });
  }
};

// Update Student Fees (Manual Add/Edit)
exports.updateStudentFees = async (req, res) => {
    try {
        const { studentId } = req.params;
        const { feeHeadId, amount, academicYear, studentYear, semester, remarks } = req.body;

        // Validation...
        
        const feeHead = await FeeHead.findById(feeHeadId);
        if(!feeHead) return res.status(404).json({success: false, message: 'Fee Head not found'});

        // We need college/course/etc for the student. Assuming it's passed or we fetch it.
        const { college, course, branch, studentName } = req.body; 

        const newFee = new StudentFee({
            studentId,
            studentName,
            feeHead: feeHeadId,
            college,
            course,
            branch,
            academicYear,
            studentYear,
            semester,
            amount,
            remarks
        });

        await newFee.save();
        res.json({success: true, message: 'Fee added successfully', fee: newFee});

    } catch (error) {
        console.error('Error updating student fees:', error);
        res.status(500).json({ success: false, message: 'Failed to update student fees' });
    }
};
