const Razorpay = require('razorpay');
const crypto = require('crypto');
const PaymentConfig = require('../MongoDb-Models/PaymentConfig'); 
const Transaction = require('../MongoDb-Models/Transaction');
const FeeHead = require('../MongoDb-Models/FeeHead');
const { masterPool } = require('../config/database');
const mongoose = require('mongoose');

// Create Razorpay Order
exports.createOrder = async (req, res) => {
    try {
        const { studentId, amount, feeHeadId, studentYear, semester, remarks } = req.body;

        if (!studentId || !amount) {
            return res.status(400).json({ success: false, message: 'Student ID and amount are required' });
        }

        // 1. Fetch Student Details to get College/Course and Prefill Data
        const [students] = await masterPool.query(
            'SELECT s.student_name, s.course, s.branch, s.student_data FROM students s LEFT JOIN colleges ON s.college_id = colleges.id LEFT JOIN courses ON s.course_id = courses.id LEFT JOIN course_branches ON s.branch_id = course_branches.id WHERE s.admission_number = ?',
            [studentId]
        );

        if (!students || students.length === 0) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }

        const student = students[0];
        let collegeName = 'Pydah Group';
        let studentEmail = '';
        let studentContact = '';

        if (student.student_data) {
            try {
                const sd = typeof student.student_data === 'string' ? JSON.parse(student.student_data) : student.student_data;
                
                // College handling
                if (sd.college) collegeName = sd.college;
                else if (sd.College) collegeName = sd.College;

                // Safe Prefill Data Extraction
                // Normalizing keys based on common exports/imports
                studentEmail = sd.student_email || sd.email || sd.Student_Email || '';
                studentContact = sd.student_mobile || sd.mobile || sd.parent_mobile1 || sd.Student_Mobile || '';
            } catch (e) {
                console.error('Error parsing student_data:', e);
            }
        }

        // 2. Fetch Active Payment Config for this College/Course
        const paymentConfig = await PaymentConfig.findOne({
            college: collegeName,
            course: student.course,
            is_active: true,
            razorpay_key_id: { $exists: true, $ne: '' }
        });

        if (!paymentConfig) {
            return res.status(404).json({ success: false, message: 'Online payment not configured for this college/course' });
        }

        // 3. Initialize Razorpay
        const razorpay = new Razorpay({
            key_id: paymentConfig.razorpay_key_id,
            key_secret: paymentConfig.razorpay_key_secret
        });

        // 4. Create Order
        const options = {
            amount: Math.round(amount * 100), // amount in smallest currency unit (paise)
            currency: 'INR',
            receipt: `rcpt_${Date.now()}_${studentId.replace(/\s+/g, '')}`,
            notes: {
                studentId,
                studentName: student.student_name,
                feeHeadId: feeHeadId || '',
                studentYear: studentYear || '',
                semester: semester || '',
                remarks: remarks || 'Online Fee Payment'
            }
        };

        const order = await razorpay.orders.create(options);

        console.log(`[PAYMENT] Order created: ${order.id} for student ${studentId} (Amount: ${amount})`);

        res.json({
            success: true,
            order,
            key_id: paymentConfig.razorpay_key_id,
            studentDetails: {
                name: student.student_name,
                email: studentEmail,
                contact: studentContact
            }
        });

    } catch (error) {
        console.error('Error creating Razorpay order:', error);
        res.status(500).json({ success: false, message: 'Failed to create payment order' });
    }
};

// Verify Payment and Record Transaction
exports.verifyPayment = async (req, res) => {
    try {
        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            studentId,
            amount,
            feeHeadId,
            studentYear,
            semester,
            remarks
        } = req.body;

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return res.status(400).json({ success: false, message: 'Missing required payment verification details' });
        }

        // 1. Uniqueness Check: Prevent duplicate recording of the same payment ID
        const existingTx = await Transaction.findOne({ gatewayPaymentId: razorpay_payment_id });
        if (existingTx) {
            console.log(`[PAYMENT] Duplicate payment verification attempt: ${razorpay_payment_id}`);
            return res.status(400).json({ 
                success: false, 
                message: 'This payment has already been recorded',
                transaction: existingTx 
            });
        }

        // 2. Fetch Student/Config to get secret for verification
        const [students] = await masterPool.query(
            'SELECT s.id, s.student_name, s.course, s.current_year, s.current_semester, s.student_data FROM students s LEFT JOIN colleges ON s.college_id = colleges.id LEFT JOIN courses ON s.course_id = courses.id LEFT JOIN course_branches ON s.branch_id = course_branches.id WHERE s.admission_number = ?',
            [studentId]
        );

        if (!students || students.length === 0) {
            return res.status(404).json({ success: false, message: 'Student not found during verification' });
        }

        const student = students[0];
        let collegeName = 'Pydah Group';
        if (student.student_data) {
            try {
                const sd = typeof student.student_data === 'string' ? JSON.parse(student.student_data) : student.student_data;
                if (sd.college) collegeName = sd.college;
                else if (sd.College) collegeName = sd.College;
            } catch (e) { /* silent */ }
        }

        const paymentConfig = await PaymentConfig.findOne({
            college: collegeName,
            course: student.course,
            is_active: true
        });

        if (!paymentConfig) {
            return res.status(404).json({ success: false, message: 'Payment configuration lost' });
        }

        // 3. Initialize Razorpay for fetch verification
        const razorpay = new Razorpay({
            key_id: paymentConfig.razorpay_key_id,
            key_secret: paymentConfig.razorpay_key_secret
        });

        // 4. Verify Signature (Internal verification)
        const sign = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSign = crypto
            .createHmac("sha256", paymentConfig.razorpay_key_secret)
            .update(sign.toString())
            .digest("hex");

        if (razorpay_signature !== expectedSign) {
            console.error(`[PAYMENT] Invalid signature for order ${razorpay_order_id}`);
            return res.status(400).json({ success: false, message: "Invalid payment signature" });
        }

        // 5. Server-Side Truth Verification: Fetch payment details from Razorpay directly
        const paymentDetails = await razorpay.payments.fetch(razorpay_payment_id);
        
        if (paymentDetails.status !== 'captured' && paymentDetails.status !== 'authorized') {
            console.error(`[PAYMENT] Payment not successful in Razorpay record: ${paymentDetails.status}`);
            return res.status(400).json({ success: false, message: `Payment status is ${paymentDetails.status}. Transaction not recorded.` });
        }

        // 6. Verify Amount (Razorpay amount is in paise)
        const expectedPaise = Math.round(Number(amount) * 100);
        if (paymentDetails.amount !== expectedPaise) {
            console.error(`[PAYMENT] Amount mismatch! Expected: ${expectedPaise}, Actual: ${paymentDetails.amount}`);
            return res.status(400).json({ success: false, message: "Payment amount mismatch. Security verification failed." });
        }

        // 7. Map Razorpay Method to Model Enum
        // Enum: ['Cash', 'UPI', 'Cheque', 'DD', 'Card', 'Net Banking', 'Adjustment', 'Waiver', 'Refund', 'Credit']
        let paymentMode = 'UPI'; // Default
        const rpMethod = paymentDetails.method?.toLowerCase();
        
        if (rpMethod === 'upi') {
            paymentMode = 'UPI';
        } else if (rpMethod === 'card') {
            paymentMode = 'Card';
        } else if (rpMethod === 'netbanking') {
            paymentMode = 'Net Banking';
        } else {
            // Fallback for wallet, emi, paylater, etc.
            paymentMode = 'UPI'; 
            console.log(`[PAYMENT] Mapping unknown Razorpay method "${rpMethod}" to UPI`);
        }

        // 8. Record Transaction in MongoDB only after all validations pass
        // Extract Bank RRN (Retrieval Reference Number) from acquirer_data
        let bankRRN = '';
        if (paymentDetails.acquirer_data) {
            bankRRN = paymentDetails.acquirer_data.rrn || paymentDetails.acquirer_data.bank_transaction_id || paymentDetails.acquirer_data.upi_transaction_id || '';
        }

        // --- SERVICE FEE LINKING (CRITICAL FOR SYNC) ---
        // If this is a service request, we MUST link it to the 'SSF' Fee Head
        // so the Fee Ledger can match it against the checking demand.
        let finalFeeHeadId = feeHeadId || null;
        let finalRemarks = remarks || `Online Payment via Razorpay (${razorpay_payment_id})`;

        if (req.body.serviceRequestId || (remarks && remarks.toLowerCase().includes('service request'))) {
            try {
                const ssFeeHead = await FeeHead.findOne({ code: 'SSF' });
                if (ssFeeHead) {
                    finalFeeHeadId = ssFeeHead._id;
                    console.log(`[PAYMENT] Linked Transaction to FeeHead: SSF (${ssFeeHead._id})`);
                }
                
                // Ensure proper formatting for matching: "Service Request: <Name> (Ref: <ID>)"
                // If we have the ID but remarks are generic, fix them.
                if (req.body.serviceRequestId && !finalRemarks.includes('Ref:')) {
                     finalRemarks += ` (Ref: ${req.body.serviceRequestId})`;
                }
            } catch (e) {
                console.error('[PAYMENT] Failed to link FeeHead SSF:', e);
            }
        }
        // -----------------------------------------------

        const newTransaction = new Transaction({
            studentId, // This is the Admission Number (from req.body)
            studentName: student.student_name,
            amount: Number(amount),
            transactionType: 'DEBIT', // Payment Received (System specific: DEBIT=Payment)
            paymentMode: paymentMode,
            referenceNo: bankRRN || razorpay_payment_id, // Store Bank RRN as primary reference, fallback to pay_id if not found
            gatewayPaymentId: razorpay_payment_id, // Store Razorpay Payment ID specifically
            referenceOrderId: razorpay_order_id,
            remarks: finalRemarks,
            feeHead: finalFeeHeadId,
            studentYear: (studentYear || student.current_year)?.toString(),
            semester: (semester || student.current_semester)?.toString(),
            paymentConfigId: paymentConfig._id,
            depositedToAccount: paymentConfig.account_name,
            paymentDate: new Date(),
            collectedBy: 'online_system',
            collectedByName: 'Razorpay (ONLINE)'
        });

        await newTransaction.save();
        console.log(`[PAYMENT] Transaction successfully recorded: ${newTransaction._id} for student ${studentId}`);

        // --- CLUB FEE UPDATE LOGIC ---
        // Check if this payment is for a Club Fee and update SQL club_members
        if (remarks && remarks.toLowerCase().includes('club fee')) {
            try {
                // Extract Club Name from remarks "Club Fee: <Name>"
                const match = remarks.match(/Club Fee:\s*(.+)/i);
                if (match && match[1]) {
                    const clubName = match[1].trim();
                    
                    // Find Club ID and Fee
                    const [clubs] = await masterPool.query('SELECT id, membership_fee FROM clubs WHERE name = ?', [clubName]);
                    
                    if (clubs.length > 0) {
                        const clubId = clubs[0].id;
                        const requiredFee = Number(clubs[0].membership_fee) || 0;

                        // Calculate Total Paid including this new transaction
                        const txs = await Transaction.find({
                            studentId: studentId,
                            transactionType: 'DEBIT',
                            remarks: { $regex: new RegExp(clubName, 'i') }
                        });
                        const totalPaid = txs.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);

                        // Only mark as PAID if fully paid
                        if (totalPaid >= requiredFee) {
                            await masterPool.query(
                                'UPDATE club_members SET payment_status = ? WHERE club_id = ? AND student_id = ?',
                                ['paid', clubId, student.id]
                            );
                            console.log(`[PAYMENT] Fully Paid Club Fee for ${studentId}, Club: ${clubName}. Status Updated.`);
                        } else {
                            console.log(`[PAYMENT] Partial Club Payment recorded for ${studentId}, Club: ${clubName}. Total: ${totalPaid}/${requiredFee}`);
                        }
                    }
                }
            } catch (clubUpdateError) {
                console.error('[PAYMENT] Error updating club member status:', clubUpdateError);
                // Non-blocking
            }
        }
        // -----------------------------

        // --- SERVICE REQUEST UPDATE LOGIC ---
        // Check if this payment is for a Service Request (we can pass serviceRequestId in body or check remarks)
        const { serviceRequestId } = req.body; // Expecting this from frontend
        if (serviceRequestId) {
             try {
                // Verify amount matches? 
                // We assume amount was correct at order creation.
                // Just update status
                await masterPool.query(
                    'UPDATE service_requests SET payment_status = ?, status = ? WHERE id = ?',
                    ['paid', 'processing', serviceRequestId]
                );
                console.log(`[PAYMENT] Updated Service Request ${serviceRequestId} to "paid"`);

             } catch (serviceUpdateError) {
                 console.error('[PAYMENT] Error updating service request status:', serviceUpdateError);
             }
        } else if (remarks && remarks.toLowerCase().includes('service request payment')) {
            // Fallback: If serviceRequestId wasn't passed but remarks has it "Service Request Payment: Name (Ref: ID)"
            try {
                const match = remarks.match(/Ref: (\d+)/i);
                if (match && match[1]) {
                    const extractedId = match[1];
                     await masterPool.query(
                        'UPDATE service_requests SET payment_status = ?, status = ? WHERE id = ?',
                        ['paid', 'processing', extractedId]
                    );
                    console.log(`[PAYMENT] Updated Service Request ${extractedId} to "paid" (Extracted from remarks)`);
                }
            } catch (e) {
                 console.error('[PAYMENT] Error parsing service request ID from remarks:', e);
            }
        }
        // -----------------------------

        res.json({
            success: true,
            message: 'Payment verified and recorded successfully',
            transaction: newTransaction
        });

    } catch (error) {
        console.error('Error verifying Razorpay payment:', error);
        res.status(500).json({ success: false, message: 'An internal error occurred during payment verification' });
    }
};
