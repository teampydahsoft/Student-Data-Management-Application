const { masterPool } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const { sendNotificationToUser } = require('./pushController');
const fs = require('fs');
const Transaction = require('../MongoDb-Models/Transaction');

const StudentFee = require('../MongoDb-Models/StudentFee');
const FeeHead = require('../MongoDb-Models/FeeHead');
const DEFAULT_CLUB_ADMIN_PAGES = ['management', 'students', 'settings'];
const getClubFeeTransactionName = (remarks) => String(remarks || '')
    .trim()
    .replace(/^club\s*fee\s*[:\-–]\s*/i, '')
    .trim()
    .toLowerCase();
const normalizeClubPagePermissions = (permissions, pages = DEFAULT_CLUB_ADMIN_PAGES) => {
    const legacyPages = Array.isArray(pages) ? pages : DEFAULT_CLUB_ADMIN_PAGES;
    return Object.fromEntries(DEFAULT_CLUB_ADMIN_PAGES.map(page => {
        const value = permissions && typeof permissions[page] === 'object' ? permissions[page] : null;
        const write = value ? value.write === true : legacyPages.includes(page);
        return [page, { read: value ? value.read === true || write : legacyPages.includes(page), write }];
    }));
};
const getAssignmentPagePermissions = (assignment) =>
    normalizeClubPagePermissions(assignment?.pagePermissions, assignment?.pages);

const normalizeClubAdminPages = (pages) => {
    if (!Array.isArray(pages)) return [...DEFAULT_CLUB_ADMIN_PAGES];
    const allowedPages = new Set(DEFAULT_CLUB_ADMIN_PAGES);
    return [...new Set(pages.filter(page => allowedPages.has(page)))];
};
const parseClubRolePages = (pages) => {
    try {
        return normalizeClubAdminPages(typeof pages === 'string' ? JSON.parse(pages) : pages);
    } catch (error) {
        return [...DEFAULT_CLUB_ADMIN_PAGES];
    }
};
const getFullAccessUserKeys = async () => {
    const [users] = await masterPool.query(
        "SELECT id, email, username, hrms_id FROM rbac_users WHERE LOWER(role) IN ('admin', 'super_admin', 'superadmin')"
    );
    return new Set((users || []).flatMap(user => [
        `id_${String(user.id).trim().toLowerCase()}`,
        user.email && `email_${String(user.email).trim().toLowerCase()}`,
        user.username && `username_${String(user.username).trim().toLowerCase()}`,
        user.hrms_id && `hrms_${String(user.hrms_id).trim().toLowerCase()}`
    ].filter(Boolean)));
};
const getAssignmentIdentityKeys = (assignment) => [
    assignment.userId && `id_${String(assignment.userId).trim().toLowerCase()}`,
    assignment.email && `email_${String(assignment.email).trim().toLowerCase()}`,
    assignment.empNo && `username_${String(assignment.empNo).trim().toLowerCase()}`,
    assignment.hrmsId && `hrms_${String(assignment.hrmsId).trim().toLowerCase()}`
].filter(Boolean);
const applyFullAccessClubPages = (assignments, fullAccessUserKeys, includeRoleFlag = false) =>
    (assignments || []).map(assignment => {
        if (!assignment) return assignment;
        const { isSuperAdmin, ...assignmentData } = assignment;
        const isFullAccess = getAssignmentIdentityKeys(assignment).some(key => fullAccessUserKeys.has(key));
        const pagePermissions = isFullAccess
            ? Object.fromEntries(DEFAULT_CLUB_ADMIN_PAGES.map(page => [page, { read: true, write: true }]))
            : getAssignmentPagePermissions(assignment);
        return {
            ...assignmentData,
            pagePermissions,
            pages: DEFAULT_CLUB_ADMIN_PAGES.filter(page => pagePermissions[page].read || pagePermissions[page].write),
            ...(includeRoleFlag ? { isSuperAdmin: isFullAccess } : {})
        };
    });


const getClubs = async (req, res) => {
    try {
        const { role, id } = req.user;
        const isAdmin = ['admin', 'super_admin', 'superadmin'].includes(String(role || '').toLowerCase());

        // Fetch clubs without transferring large base64 image strings in list JSON
        let query = 'SELECT id, name, description, membership_fee, fee_type, admin_roles, (image_url IS NOT NULL AND image_url != "") as has_image, activities, form_fields, is_active, created_at FROM clubs';
        if (!isAdmin) {
            query += ' WHERE is_active = TRUE';
        }
        query += ' ORDER BY created_at DESC';

        // Run clubs query and member counts query in parallel
        const promises = [
            masterPool.query(query),
            masterPool.query('SELECT club_id, COUNT(*) as count FROM club_members WHERE status = "approved" GROUP BY club_id')
        ];

        if (role === 'student' && id) {
            promises.push(
                masterPool.query('SELECT club_id, status, payment_status FROM club_members WHERE student_id = ?', [id])
            );
        }

        const results = await Promise.all(promises);
        let [clubs] = results[0];
        if (!isAdmin && role !== 'student') {
            const user = req.user || {};
            clubs = clubs.filter(club => {
                let assignments = [];
                try {
                    assignments = typeof club.admin_roles === 'string' ? JSON.parse(club.admin_roles) : (club.admin_roles || []);
                } catch (error) {
                    assignments = [];
                }
                return assignments.some(assignment => {
                    if (!assignment) return false;
                    const isAssigned = String(assignment.userId || '') === String(user.id || '') ||
                        (assignment.empNo && String(assignment.empNo).toLowerCase() === String(user.username || '').toLowerCase()) ||
                        (assignment.email && String(assignment.email).toLowerCase() === String(user.email || '').toLowerCase()) ||
                        (assignment.hrmsId && String(assignment.hrmsId) === String(user.hrms_id || ''));
                    const pagePermissions = getAssignmentPagePermissions(assignment);
                    return isAssigned && DEFAULT_CLUB_ADMIN_PAGES.some(page => pagePermissions[page].read);
                });
            });
        }
        const [memberCounts] = results[1];
        const [memberships] = (results[2] && results[2][0]) ? results[2] : [[]];

        const memberCountMap = {};
        for (const row of memberCounts) {
            memberCountMap[row.club_id] = row.count;
        }

        const membershipMap = {};
        for (const row of memberships) {
            membershipMap[row.club_id] = row;
        }

        // Parse JSON fields (activities, form_fields)
        const safeParse = (val) => {
            try { return typeof val === 'string' ? JSON.parse(val) : (val || []); } catch (e) { return []; }
        };

        // If student is approved or pending for any club with a fee, fetch transactions once
        let studentTransactions = [];
        const clubFeeStatusByName = new Map();
        const hasClubWithFee = role === 'student' && clubs.some(c => {
            const m = membershipMap[c.id];
            return m && (m.status === 'approved' || m.status === 'pending') && Number(c.membership_fee) > 0;
        });

        if (hasClubWithFee) {
            try {
                const [sRow] = await masterPool.query('SELECT admission_number FROM students WHERE id = ?', [id]);
                if (sRow.length > 0 && sRow[0].admission_number) {
                    const admissionNumber = sRow[0].admission_number;
                    studentTransactions = await Transaction.find({
                        studentId: admissionNumber,
                        transactionType: 'DEBIT',
                        status: { $nin: ['cancelled', 'transferred'] }
                    }).lean();

                    const clubFeeHead = await FeeHead.findOne({ $or: [{ code: 'CF' }, { name: 'Club Fee' }] }).select('_id');
                    if (clubFeeHead) {
                        const clubFeeRecords = await StudentFee.find({
                            studentId: admissionNumber,
                            feeHead: clubFeeHead._id
                        }).select('remarks status updatedAt').sort({ updatedAt: -1 }).lean();
                        clubFeeRecords.forEach(fee => {
                            const clubName = getClubFeeTransactionName(fee.remarks);
                            if (clubName && !clubFeeStatusByName.has(clubName)) {
                                clubFeeStatusByName.set(clubName, fee.status || 'active');
                            }
                        });
                    }
                }
            } catch (syncErr) {
                console.error('Error syncing club payment status:', syncErr);
            }
        }

        if (role === 'student') {
            for (const club of clubs) {
                const membership = membershipMap[club.id];
                const requiredFee = Number(club.membership_fee) || 0;
                if (!membership || requiredFee <= 0 || !['approved', 'pending'].includes(membership.status)) continue;

                const normalizedClubName = String(club.name || '').trim().toLowerCase();
                if (clubFeeStatusByName.get(normalizedClubName) === 'cancelled') {
                    if (membership.status !== 'pending' || membership.payment_status !== 'payment_due') {
                        await masterPool.query(
                            'UPDATE club_members SET status = ?, payment_status = ? WHERE club_id = ? AND student_id = ?',
                            ['pending', 'payment_due', club.id, id]
                        );
                        membershipMap[club.id] = { ...membership, status: 'pending', payment_status: 'payment_due' };
                    }
                    continue;
                }

                const paidAmount = studentTransactions
                    .filter(transaction => getClubFeeTransactionName(transaction.remarks) === normalizedClubName)
                    .reduce((total, transaction) => total + (Number(transaction.amount) || 0), 0);
                const fullyPaid = paidAmount >= requiredFee;
                const nextStatus = fullyPaid ? 'approved' : 'pending';
                const nextPaymentStatus = fullyPaid ? 'paid' : 'payment_due';

                if (membership.status !== nextStatus || membership.payment_status !== nextPaymentStatus) {
                    await masterPool.query(
                        'UPDATE club_members SET status = ?, payment_status = ? WHERE club_id = ? AND student_id = ?',
                        [nextStatus, nextPaymentStatus, club.id, id]
                    );
                    membershipMap[club.id] = {
                        ...membership,
                        status: nextStatus,
                        payment_status: nextPaymentStatus
                    };
                }

                if (fullyPaid && membership.status !== 'approved') {
                    const [channels] = await masterPool.query(
                        'SELECT id FROM chat_channels WHERE club_id = ? AND is_active = 1 LIMIT 1',
                        [club.id]
                    );
                    if (channels.length > 0) {
                        await masterPool.query(
                            'INSERT IGNORE INTO chat_channel_members (channel_id, member_type, student_id) VALUES (?, ?, ?)',
                            [channels[0].id, 'student', id]
                        );
                    }
                }
            }
        }

        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const fullAccessUserKeys = await getFullAccessUserKeys();

        const enrichedClubs = clubs.map(club => {
            const pagePermissions = req.clubPagePermissionsByClubId?.[club.id] || req.clubPagePermissions;
            const canReadMembers = role === 'student' || !pagePermissions || pagePermissions.students?.read;
            const count = canReadMembers ? (memberCountMap[club.id] || 0) : 0;
            const membership = membershipMap[club.id];
            let userStatus = membership ? membership.status : null;
            let paymentStatus = membership ? membership.payment_status : null;

            let paid_amount = 0;
            const requiredFee = Number(club.membership_fee) || 0;
            let balance_due = requiredFee;

            if (role === 'student' && membership && requiredFee > 0 && ['approved', 'pending'].includes(membership.status)) {
                const normalizedClubName = String(club.name || '').trim().toLowerCase();
                const feeWasCancelled = clubFeeStatusByName.get(normalizedClubName) === 'cancelled';
                const matchingTxs = feeWasCancelled
                    ? []
                    : studentTransactions.filter(tx => getClubFeeTransactionName(tx.remarks) === normalizedClubName);
                paid_amount = matchingTxs.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
                balance_due = Math.max(0, requiredFee - paid_amount);

                if (paid_amount >= requiredFee && (userStatus !== 'approved' || paymentStatus !== 'paid')) {
                    paymentStatus = 'paid';
                    userStatus = 'approved';
                } else if (paid_amount < requiredFee) {
                    paymentStatus = 'payment_due';
                    userStatus = 'pending';
                }
            }

            const canReadManagement = !pagePermissions || pagePermissions.management?.read;
            const canReadSettings = !pagePermissions || pagePermissions.settings?.read;
            const canReadActivities = role === 'student' ? userStatus === 'approved' : canReadManagement;
            const activities = canReadActivities ? safeParse(club.activities) : [];

            return {
                ...club,
                image_url: club.has_image ? `${baseUrl}/api/clubs/${club.id}/image` : null,
                form_fields: safeParse(club.form_fields),
                admin_roles: role !== 'student' && canReadSettings
                    ? applyFullAccessClubPages(safeParse(club.admin_roles), fullAccessUserKeys, true)
                    : [],
                members: new Array(count).fill({}),
                memberCount: count,
                activities,
                userStatus,
                payment_status: paymentStatus,
                paid_amount,
                balance_due
            };
        });

        res.json({ success: true, data: enrichedClubs });
    } catch (error) {
        console.error('Error fetching clubs:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch clubs' });
    }
};

const createClub = async (req, res) => {
    try {
        const { name, description, membership_fee, fee_type, admin_roles } = req.body;

        // target_audience removed

        let image_url = '';

        if (req.file) {
            try {
                const fileBuffer = fs.readFileSync(req.file.path);
                const base64Image = fileBuffer.toString('base64');
                const mimeType = req.file.mimetype;
                image_url = `data:${mimeType};base64,${base64Image}`;

                // Clean up temp file
                fs.unlinkSync(req.file.path);
            } catch (fileError) {
                console.error('Error processing profile image:', fileError);
                // Continue without image or handle error
            }
        }
        // Fallback or explicit URL (though uncommon now with file upload priority)
        else if (req.body.image_url) {
            image_url = req.body.image_url;
        }

        // Default empty arrays for members and activities
        const members = JSON.stringify([]);
        const activities = JSON.stringify([]);
        const form_fields = JSON.stringify([]);
        const suppliedAdminRoles = typeof admin_roles === 'string' ? JSON.parse(admin_roles) : (admin_roles || []);
        const fullAccessUserKeys = await getFullAccessUserKeys();
        const parsedAdminRoles = JSON.stringify(applyFullAccessClubPages(suppliedAdminRoles, fullAccessUserKeys));

        await masterPool.query(
            'INSERT INTO clubs (name, description, image_url, form_fields, members, activities, created_by, membership_fee, fee_type, admin_roles) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [name, description, image_url, form_fields, members, activities, req.user?.id || null, membership_fee || 0, fee_type || 'Yearly', parsedAdminRoles]
        );

        res.json({ success: true, message: 'Club created successfully', data: { image_url } });
    } catch (error) {
        console.error('Error creating club:', error);
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ success: false, message: 'Failed to create club' });
    }
};

const joinClub = async (req, res) => {
    try {
        const { clubId } = req.params;
        const studentId = req.user.id;

        // Check if already a member
        const [existing] = await masterPool.query(
            'SELECT id FROM club_members WHERE club_id = ? AND student_id = ?',
            [clubId, studentId]
        );

        if (existing.length > 0) {
            return res.status(400).json({ success: false, message: 'Already requested or joined' });
        }

        const [clubs] = await masterPool.query('SELECT name, created_by, membership_fee, fee_type FROM clubs WHERE id = ?', [clubId]);
        if (clubs.length === 0) return res.status(404).json({ success: false, message: 'Club not found' });

        const club = clubs[0];
        const membershipFee = parseFloat(club.membership_fee) || 0;
        const feeType = club.fee_type || 'Yearly';

        if (membershipFee === 0) {
            // Free club: Auto-approve entry immediately
            await masterPool.query(
                'INSERT INTO club_members (club_id, student_id, status, payment_status, fee_type) VALUES (?, ?, ?, ?, ?)',
                [clubId, studentId, 'approved', 'NA', feeType]
            );

            // Add student to chat channel if exists
            const [chan] = await masterPool.query(
                'SELECT id FROM chat_channels WHERE club_id = ? AND is_active = 1 LIMIT 1',
                [clubId]
            );
            if (chan.length) {
                await masterPool.query(
                    'INSERT IGNORE INTO chat_channel_members (channel_id, member_type, student_id) VALUES (?, ?, ?)',
                    [chan[0].id, 'student', studentId]
                ).catch(() => {});
            }

            return res.json({ success: true, message: 'Successfully joined club!' });
        } else {
            // Paid club: Set payment_due. Entry will auto-approve when student pays fee.
            await masterPool.query(
                'INSERT INTO club_members (club_id, student_id, status, payment_status, fee_type) VALUES (?, ?, ?, ?, ?)',
                [clubId, studentId, 'pending', 'payment_due', feeType]
            );

            // --- ACTIVE SYNC: Create StudentFee demand row in Fee Management ---
            try {
                const [stRows] = await masterPool.query(
                    'SELECT admission_number, student_name, course, branch, current_year, current_semester, student_data FROM students WHERE id = ?',
                    [studentId]
                );

                if (stRows.length > 0) {
                    const st = stRows[0];
                    let collegeName = 'Pydah Group';
                    if (st.student_data) {
                        try {
                            const sd = typeof st.student_data === 'string' ? JSON.parse(st.student_data) : st.student_data;
                            if (sd.college || sd.College) collegeName = sd.college || sd.College;
                        } catch (e) {}
                    }

                    // Find or create 'Club Fee' Head
                    let feeHead = await FeeHead.findOne({ name: 'Club Fee' });
                    if (!feeHead) {
                        feeHead = await FeeHead.create({
                            name: 'Club Fee',
                            code: 'CF',
                            description: 'Club Fee',
                            type: 'Individual',
                            frequency: 'One-time',
                            isActive: true
                        });
                    } else if (feeHead.description !== 'Club Fee') {
                        feeHead.description = 'Club Fee';
                        await feeHead.save();
                    }

                    const expectedRemarks = club.name;
                    const existingFee = await StudentFee.findOne({
                        studentId: st.admission_number,
                        feeHead: feeHead._id,
                        remarks: { $in: [expectedRemarks, `Club Fee: ${club.name}`] }
                    });

                    if (existingFee && existingFee.remarks !== expectedRemarks) {
                        existingFee.remarks = expectedRemarks;
                        await existingFee.save();
                    } else if (!existingFee) {
                        await StudentFee.create({
                            studentId: st.admission_number,
                            studentName: st.student_name || 'Student',
                            feeHead: feeHead._id,
                            college: collegeName,
                            course: st.course || 'NA',
                            branch: st.branch || 'NA',
                            academicYear: '2024-2025',
                            studentYear: st.current_year || 1,
                            semester: st.current_semester || 1,
                            amount: membershipFee,
                            remarks: expectedRemarks
                        });
                        console.log(`[ACTIVE SYNC] Created Club Fee demand for ${st.admission_number}: ${club.name}`);
                    }
                }
            } catch (feeSyncErr) {
                console.error('[ACTIVE SYNC WARNING] Failed to create club fee demand:', feeSyncErr);
            }

            return res.json({
                success: true,
                message: `Club registration initiated! A fee demand of ₹${membershipFee} has been added to your Fee Management. Please pay it from Fee Management to complete joining.`
            });
        }
    } catch (error) {
        console.error('Error joining club:', error);
        res.status(500).json({ success: false, message: 'Failed to join club' });
    }
};

const updateMembershipStatus = async (req, res) => {
    try {
        const { clubId } = req.params;
        const { studentId, status } = req.body; // status: 'approved' | 'rejected'

        // If approving, check club fee and set payment_status accordingly
        if (status === 'approved') {
            const [club] = await masterPool.query('SELECT name, membership_fee, fee_type FROM clubs WHERE id = ?', [clubId]);
            if (club.length === 0) {
                return res.status(404).json({ success: false, message: 'Club not found' });
            }

            const fee = parseFloat(club[0].membership_fee) || 0;
            const feeType = club[0].fee_type || 'Yearly';
            const newPaymentStatus = fee > 0 ? 'payment_due' : 'NA';

            const [result] = await masterPool.query(
                'UPDATE club_members SET status = ?, payment_status = ?, fee_type = ? WHERE club_id = ? AND (student_id = ? OR id = ?)',
                [status, newPaymentStatus, feeType, clubId, studentId, studentId]
            );

            if (result.affectedRows === 0) {
                return res.status(404).json({ success: false, message: 'Member not found' });
            }

            // Add student to club's chat channel if it exists
            const [chan] = await masterPool.query(
                'SELECT id FROM chat_channels WHERE club_id = ? AND is_active = 1 LIMIT 1',
                [clubId]
            );
            if (chan.length) {
                await masterPool.query(
                    'INSERT IGNORE INTO chat_channel_members (channel_id, member_type, student_id) VALUES (?, ?, ?)',
                    [chan[0].id, 'student', studentId]
                ).catch(() => {});
            }

            // Notify Student
            const title = fee > 0 ? `Club Membership Approved - Payment Due` : `Club Membership Approved!`;
            const body = fee > 0 ? `You have been approved for ${club[0].name}. Please pay ₹${fee} to complete joining.` : `Welcome to ${club[0].name}! You can now access club activities.`;

            sendNotificationToUser(studentId, {
                title,
                body,
                icon: '/icon-192x192.png',
                data: { url: '/student/clubs' }
            }).catch(console.error);

        } else {
            // Rejection
            const [club] = await masterPool.query('SELECT name FROM clubs WHERE id = ?', [clubId]);

            // For rejection, just update status
            const [result] = await masterPool.query(
                'UPDATE club_members SET status = ?, payment_status = ? WHERE club_id = ? AND (student_id = ? OR id = ?)',
                [status, 'NA', clubId, studentId, studentId]
            );

            if (result.affectedRows === 0) {
                return res.status(404).json({ success: false, message: 'Member not found' });
            }

            if (club.length > 0) {
                sendNotificationToUser(studentId, {
                    title: `Club Request Rejected`,
                    body: `Your request to join ${club[0].name} was not approved.`,
                    icon: '/icon-192x192.png',
                    data: { url: '/student/clubs' }
                }).catch(console.error);
            }
        }

        res.json({ success: true, message: `Member ${status}` });
    } catch (error) {
        console.error('Error updating membership:', error);
        res.status(500).json({ success: false, message: 'Failed to update membership' });
    }
};

const createActivity = async (req, res) => {
    try {
        const { clubId } = req.params;
        const { title, description } = req.body;
        let image_url = '';

        if (req.file) {
            image_url = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
        } else if (req.body.image_url) {
            image_url = req.body.image_url;
        }

        const newActivity = {
            id: uuidv4(),
            title,
            description,
            image_url,
            posted_by: req.user.id,
            posted_at: new Date().toISOString()
        };

        // Atomic append
        await masterPool.query(
            "UPDATE clubs SET activities = JSON_ARRAY_APPEND(COALESCE(activities, JSON_ARRAY()), '$', CAST(? AS JSON)) WHERE id = ?",
            [JSON.stringify(newActivity), clubId]
        );

        res.json({ success: true, message: 'Activity posted successfully' });

        // Notify Club Members
        notifyClubMembers(clubId, title, description).catch(err => console.error('Club notification error:', err));

    } catch (error) {
        console.error('Error creating activity:', error);
        res.status(500).json({ success: false, message: 'Failed to post activity' });
    }
};

const updateActivity = async (req, res) => {
    try {
        const { clubId, activityId } = req.params;
        const { title, description } = req.body;
        let image_url = null;

        if (req.file) {
            image_url = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
        } else if (req.body.image_url) {
            image_url = req.body.image_url;
        }

        // Fetch current activities
        const [rows] = await masterPool.query('SELECT activities FROM clubs WHERE id = ?', [clubId]);
        if (rows.length === 0) return res.status(404).json({ success: false, message: 'Club not found' });

        let activities = [];
        try {
            activities = typeof rows[0].activities === 'string' ? JSON.parse(rows[0].activities) : (rows[0].activities || []);
        } catch (e) {
            activities = [];
        }

        const activityIndex = activities.findIndex(a => a.id === activityId);
        if (activityIndex === -1) {
            return res.status(404).json({ success: false, message: 'Activity not found' });
        }

        // Update fields
        activities[activityIndex].title = title;
        activities[activityIndex].description = description;
        if (image_url) {
            activities[activityIndex].image_url = image_url;
        }
        activities[activityIndex].updated_at = new Date().toISOString();

        // Write back
        await masterPool.query('UPDATE clubs SET activities = ? WHERE id = ?', [JSON.stringify(activities), clubId]);

        res.json({ success: true, message: 'Activity updated successfully' });
    } catch (error) {
        console.error('Error updating activity:', error);
        res.status(500).json({ success: false, message: 'Failed to update activity' });
    }
};

const deleteActivity = async (req, res) => {
    try {
        const { clubId, activityId } = req.params;

        // Fetch current activities
        const [rows] = await masterPool.query('SELECT activities FROM clubs WHERE id = ?', [clubId]);
        if (rows.length === 0) return res.status(404).json({ success: false, message: 'Club not found' });

        let activities = [];
        try {
            activities = typeof rows[0].activities === 'string' ? JSON.parse(rows[0].activities) : (rows[0].activities || []);
        } catch (e) {
            activities = [];
        }

        const newActivities = activities.filter(a => a.id !== activityId);

        if (activities.length === newActivities.length) {
            return res.status(404).json({ success: false, message: 'Activity not found' });
        }

        // Write back
        await masterPool.query('UPDATE clubs SET activities = ? WHERE id = ?', [JSON.stringify(newActivities), clubId]);

        res.json({ success: true, message: 'Activity deleted successfully' });
    } catch (error) {
        console.error('Error deleting activity:', error);
        res.status(500).json({ success: false, message: 'Failed to delete activity' });
    }
};

// Helper: Notify club members
const notifyClubMembers = async (clubId, title, description) => {
    try {
        // Fetch approved members from club_members table
        const [approvedMembers] = await masterPool.query(
            'SELECT student_id FROM club_members WHERE club_id = ? AND status = "approved"',
            [clubId]
        );


        if (approvedMembers.length === 0) return;

        const payload = {
            title: `New Club Activity: ${title}`,
            body: `${description ? description.substring(0, 50) + '...' : 'Check club for details.'}`,
            icon: '/icon-192x192.png',
            data: {
                url: `https://pydahgroup.com/student/clubs/${clubId}`
            }
        };

        const promises = approvedMembers.map(m => sendNotificationToUser(m.student_id, payload));
        await Promise.allSettled(promises);
        console.log(`Club activity notifications sent to ${approvedMembers.length} members.`);

    } catch (error) {
        console.error('Failed to notify club members:', error);
    }
};

const getClubDetails = async (req, res) => {
    try {
        const { clubId } = req.params;
        const [clubs] = await masterPool.query('SELECT * FROM clubs WHERE id = ?', [clubId]);

        if (clubs.length === 0) {
            return res.status(404).json({ success: false, message: 'Club not found' });
        }

        const club = clubs[0];

        // Helper to safe parse
        const safeParse = (val) => {
            if (!val) return [];
            try {
                return typeof val === 'string' ? JSON.parse(val) : val;
            } catch (e) { return []; }
        };

        let members = [];
        try {
            const [rows] = await masterPool.query(
                `SELECT cm.id, cm.club_id, cm.student_id, cm.status, cm.payment_status, 
                        cm.fee_type, cm.joined_at,
                        COALESCE(s.student_name, '') as student_name, 
                        COALESCE(s.admission_number, '') as admission_number,
                        COALESCE(s.pin_no, '') as pin_no,
                        COALESCE(s.student_mobile, '') as student_mobile,
                        COALESCE(s.email, '') as email,
                        COALESCE(s.college, '') as college,
                        COALESCE(s.course, '') as course,
                        COALESCE(s.branch, '') as branch,
                        COALESCE(s.current_year, 1) as current_year,
                        COALESCE(s.current_semester, 1) as current_semester
                 FROM club_members cm 
                 LEFT JOIN students s ON (cm.student_id = s.id OR cm.student_id = s.admission_number)
                 WHERE cm.club_id = ?
                 ORDER BY cm.joined_at DESC`,
                [clubId]
            );
            members = rows || [];

            // Check and sync payment details from MongoDB if club has fee
            if (members.length > 0 && Number(club.membership_fee) > 0) {
                const normalizedClubName = String(club.name || '').trim().toLowerCase();
                const admissionNumbers = members.map(m => m.admission_number).filter(Boolean);
                if (admissionNumbers.length > 0) {
                    try {
                        const clubFeeHead = await FeeHead.findOne({ $or: [{ code: 'CF' }, { name: 'Club Fee' }] }).select('_id');
                        const txQuery = {
                            studentId: { $in: admissionNumbers },
                            transactionType: 'DEBIT',
                            status: { $nin: ['cancelled', 'transferred'] }
                        };
                        if (clubFeeHead) {
                            txQuery.$or = [
                                { feeHead: clubFeeHead._id },
                                { remarks: { $regex: new RegExp(normalizedClubName, 'i') } }
                            ];
                        } else {
                            txQuery.remarks = { $regex: new RegExp(normalizedClubName, 'i') };
                        }

                        const txs = await Transaction.find(txQuery).select('studentId amount remarks').lean();
                        const paidMap = new Map();
                        txs.forEach(tx => {
                            if (tx.remarks && !tx.remarks.toLowerCase().includes(normalizedClubName)) return;
                            const prev = paidMap.get(tx.studentId) || 0;
                            paidMap.set(tx.studentId, prev + (Number(tx.amount) || 0));
                        });

                        const requiredFee = Number(club.membership_fee) || 0;
                        const autoApprovePromises = [];
                        members = members.map(m => {
                            const paid = paidMap.get(m.admission_number) || 0;
                            const isPaid = requiredFee <= 0 || paid >= requiredFee;
                            const due = Math.max(0, requiredFee - paid);
                            const nextStatus = isPaid ? 'approved' : 'pending';
                            const nextPaymentStatus = isPaid ? 'paid' : (m.payment_status === 'NA' ? 'NA' : 'payment_due');

                            if (isPaid && (m.status !== 'approved' || m.payment_status !== 'paid')) {
                                autoApprovePromises.push(
                                    masterPool.query(
                                        'UPDATE club_members SET status = "approved", payment_status = "paid" WHERE club_id = ? AND (student_id = ? OR id = ?)',
                                        [clubId, m.student_id, m.id]
                                    ).catch(e => console.error('Auto-approval error on fee payment:', e.message))
                                );
                            }

                            return {
                                ...m,
                                paid_amount: paid,
                                due_amount: due,
                                status: nextStatus,
                                payment_status: nextPaymentStatus
                            };
                        });
                        if (autoApprovePromises.length > 0) {
                            await Promise.allSettled(autoApprovePromises);
                        }
                    } catch (txErr) {
                        console.error('Error fetching transactions for club members in getClubDetails:', txErr);
                    }
                }
            }
        } catch (memErr) {
            console.error('Error fetching club members for club details:', memErr.message);
            members = [];
        }

        const parsedClub = {
            ...club,
            form_fields: safeParse(club.form_fields),
            admin_roles: !req.clubPagePermissions || req.clubPagePermissions.settings.read
                ? applyFullAccessClubPages(safeParse(club.admin_roles), await getFullAccessUserKeys(), true)
                : [],
            members: req.clubPagePermissions?.students?.read || !req.clubPagePermissions ? members : [],
            activities: req.clubPagePermissions?.management?.read || !req.clubPagePermissions
                ? safeParse(club.activities)
                : []
        };

        res.json({ success: true, data: parsedClub });

    } catch (error) {
        console.error('Error fetching club details:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch club details', error: error.message });
    }
};

const updateClub = async (req, res) => {
    try {
        const { clubId } = req.params;
        const { name, description, membership_fee, fee_type, admin_roles } = req.body;

        let query = 'UPDATE clubs SET name = ?, description = ?, membership_fee = ?, fee_type = ?';
        let params = [name, description, membership_fee || 0, fee_type || 'Yearly'];

        if (admin_roles !== undefined && ['admin', 'super_admin', 'superadmin'].includes(String(req.user?.role || '').toLowerCase())) {
            const suppliedAdminRoles = typeof admin_roles === 'string' ? JSON.parse(admin_roles) : (admin_roles || []);
            const fullAccessUserKeys = await getFullAccessUserKeys();
            const parsedAdminRoles = JSON.stringify(applyFullAccessClubPages(suppliedAdminRoles, fullAccessUserKeys));
            query += ', admin_roles = ?';
            params.push(parsedAdminRoles);
        }



        if (req.file) {
            try {
                const fileBuffer = fs.readFileSync(req.file.path);
                const base64Image = fileBuffer.toString('base64');
                const mimeType = req.file.mimetype;
                const image_url = `data:${mimeType};base64,${base64Image}`;

                query += ', image_url = ?';
                params.push(image_url);

                fs.unlinkSync(req.file.path);
            } catch (fileError) {
                console.error('Error processing update image:', fileError);
            }
        }

        query += ' WHERE id = ?';
        params.push(clubId);

        await masterPool.query(query, params);

        res.json({ success: true, message: 'Club updated successfully' });
    } catch (error) {
        console.error('Error updating club:', error);
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ success: false, message: 'Failed to update club' });
    }
};

const deleteClub = async (req, res) => {
    try {
        const { clubId } = req.params;
        // Hard delete as requested, or match the query filter
        await masterPool.query('DELETE FROM clubs WHERE id = ?', [clubId]);
        res.json({ success: true, message: 'Club deleted successfully' });
    } catch (error) {
        console.error('Error deleting club:', error);
        res.status(500).json({ success: false, message: 'Failed to delete club' });
    }
};

const toggleClubStatus = async (req, res) => {
    try {
        const { clubId } = req.params;
        const { isActive } = req.body;

        await masterPool.query('UPDATE clubs SET is_active = ? WHERE id = ?', [isActive, clubId]);

        res.json({ success: true, message: `Club ${isActive ? 'activated' : 'deactivated'} successfully` });
    } catch (error) {
        console.error('Error toggling club status:', error);
        res.status(500).json({ success: false, message: 'Failed to update club status' });
    }
};

const getClubImage = async (req, res) => {
    try {
        const targetId = req.params.id || req.params.clubId;
        const [rows] = await masterPool.query(
            'SELECT image_url FROM clubs WHERE id = ?',
            [targetId]
        );

        if (rows.length === 0 || !rows[0].image_url) {
            return res.status(404).send('Image not found');
        }

        const raw = rows[0].image_url;
        if (typeof raw === 'string' && raw.startsWith('data:')) {
            const matches = raw.match(/^data:([^;]+);base64,(.+)$/);
            if (matches) {
                const contentType = matches[1];
                const buffer = Buffer.from(matches[2], 'base64');
                res.setHeader('Content-Type', contentType);
                res.setHeader('Cache-Control', 'public, max-age=86400');
                return res.send(buffer);
            }
        }

        if (typeof raw === 'string' && (raw.startsWith('http://') || raw.startsWith('https://'))) {
            return res.redirect(raw);
        }

        return res.status(404).send('Invalid image format');
    } catch (err) {
        console.error('Error serving club image:', err);
        res.status(500).send('Error serving image');
    }
};

// ================= Dynamic Club Roles Controllers =================

const getClubRoles = async (req, res) => {
    try {
        const [roles] = await masterPool.query('SELECT * FROM club_roles ORDER BY is_system DESC, role_name ASC');
        res.json({
            success: true,
            data: roles.map(role => ({ ...role, pages: parseClubRolePages(role.pages) }))
        });
    } catch (error) {
        console.error('Error fetching dynamic club roles:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch club roles' });
    }
};

const createClubRole = async (req, res) => {
    try {
        const { role_name, description, pages } = req.body;
        if (!role_name || !role_name.trim()) {
            return res.status(400).json({ success: false, message: 'Role name is required' });
        }

        const role_code = role_name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_');
        const rolePages = normalizeClubAdminPages(pages);

        const [existing] = await masterPool.query('SELECT id FROM club_roles WHERE role_code = ?', [role_code]);
        if (existing.length > 0) {
            return res.status(400).json({ success: false, message: 'A club role with this name already exists' });
        }

        const [result] = await masterPool.query(
            'INSERT INTO club_roles (role_name, role_code, description, pages, is_system) VALUES (?, ?, ?, ?, FALSE)',
            [role_name.trim(), role_code, description || '', JSON.stringify(rolePages)]
        );

        res.json({
            success: true,
            message: 'Club role created successfully',
            data: { id: result.insertId, role_name: role_name.trim(), role_code, description, pages: rolePages, is_system: false }
        });
    } catch (error) {
        console.error('Error creating club role:', error);
        res.status(500).json({ success: false, message: 'Failed to create club role' });
    }
};

const updateClubRole = async (req, res) => {
    try {
        const { roleId } = req.params;
        const { role_name, description, pages } = req.body;

        const [existing] = await masterPool.query('SELECT * FROM club_roles WHERE id = ?', [roleId]);
        if (existing.length === 0) {
            return res.status(404).json({ success: false, message: 'Role not found' });
        }

        const rolePages = normalizeClubAdminPages(pages ?? parseClubRolePages(existing[0].pages));

        await masterPool.query(
            'UPDATE club_roles SET role_name = ?, description = ?, pages = ? WHERE id = ?',
            [role_name.trim(), description || '', JSON.stringify(rolePages), roleId]
        );

        const [clubs] = await masterPool.query('SELECT id, admin_roles FROM clubs');
        const fullAccessUserKeys = await getFullAccessUserKeys();
        for (const club of clubs || []) {
            let assignments = [];
            try {
                assignments = typeof club.admin_roles === 'string' ? JSON.parse(club.admin_roles) : (club.admin_roles || []);
            } catch (error) {
                assignments = [];
            }
            let changed = false;
            const updatedAssignments = assignments.map(assignment => {
                if (!assignment || assignment.roleCode !== existing[0].role_code) return assignment;
                changed = true;
                return {
                    ...assignment,
                    roleName: role_name.trim(),
                    pages: rolePages,
                    pagePermissions: normalizeClubPagePermissions(null, rolePages)
                };
            });
            if (changed) {
                const enforcedAssignments = applyFullAccessClubPages(updatedAssignments, fullAccessUserKeys);
                await masterPool.query('UPDATE clubs SET admin_roles = ? WHERE id = ?', [JSON.stringify(enforcedAssignments), club.id]);
            }
        }

        res.json({ success: true, message: 'Club role updated successfully' });
    } catch (error) {
        console.error('Error updating club role:', error);
        res.status(500).json({ success: false, message: 'Failed to update club role' });
    }
};

const deleteClubRole = async (req, res) => {
    try {
        const { roleId } = req.params;

        const [existing] = await masterPool.query('SELECT id FROM club_roles WHERE id = ?', [roleId]);
        if (existing.length === 0) {
            return res.status(404).json({ success: false, message: 'Role not found' });
        }

        await masterPool.query('DELETE FROM club_roles WHERE id = ?', [roleId]);

        res.json({ success: true, message: 'Club role deleted successfully' });
    } catch (error) {
        console.error('Error deleting club role:', error);
        res.status(500).json({ success: false, message: 'Failed to delete club role' });
    }
};

// ================= HRMS User Account Check =================

const checkHrmsUserAccount = async (req, res) => {
    try {
        const { hrms_id, email, emp_no } = req.query;

        if (!hrms_id && !email && !emp_no) {
            return res.status(400).json({ success: false, message: 'Please provide hrms_id, email, or emp_no' });
        }

        // Query rbac_users for linked SDMS account
        let userQuery = 'SELECT id, name, email, username, role, hrms_id FROM rbac_users WHERE 1=0';
        let params = [];

        if (hrms_id) {
            userQuery += ' OR hrms_id = ?';
            params.push(hrms_id);
        }
        if (email) {
            userQuery += ' OR email = ?';
            params.push(email);
        }
        if (emp_no) {
            userQuery += ' OR username = ?';
            params.push(emp_no);
        }

        const [users] = await masterPool.query(userQuery, params);

        if (users.length > 0) {
            return res.json({
                success: true,
                hasUserAccount: true,
                userAccount: users[0],
                message: 'SDMS user account found for this employee.'
            });
        }

        return res.json({
            success: true,
            hasUserAccount: false,
            userAccount: null,
            message: 'No SDMS user account exists for this employee.'
        });
    } catch (error) {
        console.error('Error checking HRMS user account:', error);
        res.status(500).json({ success: false, message: 'Failed to check employee user account' });
    }
};

// ================= Approvals & All Students =================

const getAllClubApprovals = async (req, res) => {
    try {
        const [rows] = await masterPool.query(
            `SELECT cm.id as membership_id, cm.club_id, c.name as club_name, c.image_url as club_image,
                    cm.student_id, COALESCE(s.student_name, '') as student_name, s.admission_number,
                    COALESCE(s.student_mobile, '') as phone_number,
                    s.course_id, s.branch_id, cm.status, cm.payment_status, cm.joined_at
             FROM club_members cm 
             JOIN clubs c ON cm.club_id = c.id 
             JOIN students s ON cm.student_id = s.id 
             WHERE cm.status = 'pending'
             ORDER BY cm.joined_at DESC`
        );

        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('Error fetching club approvals:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch club approvals' });
    }
};

const getAllClubStudents = async (req, res) => {
    try {
        const { club_id, status } = req.query;

        let query = `
            SELECT cm.id as membership_id, cm.club_id, c.name as club_name,
                   cm.student_id, COALESCE(s.student_name, '') as student_name, s.admission_number,
                   COALESCE(s.student_mobile, '') as phone_number,
                   s.course_id, s.branch_id, cm.status, cm.payment_status, cm.joined_at
            FROM club_members cm 
            JOIN clubs c ON cm.club_id = c.id 
            JOIN students s ON cm.student_id = s.id 
            WHERE 1=1
        `;
        let params = [];

        if (Array.isArray(req.clubAdminClubIds)) {
            query += ` AND cm.club_id IN (${req.clubAdminClubIds.map(() => '?').join(',')})`;
            params.push(...req.clubAdminClubIds);
        }

        if (club_id) {
            query += ' AND cm.club_id = ?';
            params.push(club_id);
        }
        if (status) {
            query += ' AND cm.status = ?';
            params.push(status);
        } else {
            // By default, do not show pending students in the general student list
            query += ' AND cm.status = "approved"';
        }

        query += ' ORDER BY cm.joined_at DESC';

        const [rows] = await masterPool.query(query, params);
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('Error fetching club students:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch club students' });
    }
};

const getSeminarHallTimeMinutes = value => {
    const match = String(value || '').match(/^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/);
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};

const getSeminarHalls = async (req, res) => {
    try {
        const [halls] = await masterPool.query(
            `SELECT id, hall_name, location, capacity, description, open_time, close_time, created_at
             FROM seminar_halls WHERE is_active = 1 ORDER BY hall_name`
        );
        res.json({ success: true, data: halls });
    } catch (error) {
        console.error('Error fetching seminar halls:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch seminar halls' });
    }
};

const createSeminarHall = async (req, res) => {
    const { hallName, location = '', capacity, description = '', openTime, closeTime } = req.body;
    const numericCapacity = Number(capacity);
    const openMinutes = getSeminarHallTimeMinutes(openTime);
    const closeMinutes = getSeminarHallTimeMinutes(closeTime);
    if (!hallName?.trim() || !Number.isInteger(numericCapacity) || numericCapacity < 1 ||
        openMinutes === null || closeMinutes === null || openMinutes >= closeMinutes) {
        return res.status(400).json({ success: false, message: 'Provide a hall name, positive capacity, and a valid opening period' });
    }

    try {
        const [result] = await masterPool.execute(
            `INSERT INTO seminar_halls (hall_name, location, capacity, description, open_time, close_time, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [hallName.trim(), String(location).trim(), numericCapacity, String(description).trim(), openTime, closeTime, req.user.id]
        );
        res.status(201).json({ success: true, message: 'Seminar hall created', id: result.insertId });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ success: false, message: 'A seminar hall with this name already exists' });
        }
        console.error('Error creating seminar hall:', error);
        res.status(500).json({ success: false, message: 'Failed to create seminar hall' });
    }
};

const updateSeminarHall = async (req, res) => {
    const { hallName, location = '', capacity, description = '', openTime, closeTime } = req.body;
    const numericCapacity = Number(capacity);
    const openMinutes = getSeminarHallTimeMinutes(openTime);
    const closeMinutes = getSeminarHallTimeMinutes(closeTime);
    if (!hallName?.trim() || !Number.isInteger(numericCapacity) || numericCapacity < 1 ||
        openMinutes === null || closeMinutes === null || openMinutes >= closeMinutes) {
        return res.status(400).json({ success: false, message: 'Provide a hall name, positive capacity, and a valid opening period' });
    }

    try {
        const [result] = await masterPool.execute(
            `UPDATE seminar_halls
             SET hall_name = ?, location = ?, capacity = ?, description = ?, open_time = ?, close_time = ?
             WHERE id = ? AND is_active = 1`,
            [hallName.trim(), String(location).trim(), numericCapacity, String(description).trim(), openTime, closeTime, req.params.hallId]
        );
        if (result.affectedRows === 0) {
            const [existingHalls] = await masterPool.execute(
                'SELECT id FROM seminar_halls WHERE id = ? AND is_active = 1 LIMIT 1',
                [req.params.hallId]
            );
            if (existingHalls.length === 0) {
                return res.status(404).json({ success: false, message: 'Seminar hall not found' });
            }
        }
        res.json({ success: true, message: 'Seminar hall updated' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ success: false, message: 'A seminar hall with this name already exists' });
        }
        console.error('Error updating seminar hall:', error);
        res.status(500).json({ success: false, message: 'Failed to update seminar hall' });
    }
};

const deleteSeminarHall = async (req, res) => {
    try {
        const [result] = await masterPool.execute(
            'UPDATE seminar_halls SET is_active = 0 WHERE id = ? AND is_active = 1',
            [req.params.hallId]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Seminar hall not found' });
        }
        res.json({ success: true, message: 'Seminar hall deleted' });
    } catch (error) {
        console.error('Error deleting seminar hall:', error);
        res.status(500).json({ success: false, message: 'Failed to delete seminar hall' });
    }
};

const getSeminarHallRequestColumns = async () => {
    const [rows] = await masterPool.query('SHOW COLUMNS FROM seminar_hall_requests');
    return new Set(rows.map(row => row.Field));
};

const normalizeSeminarAudienceIds = (values, legacyValue) => {
    const source = Array.isArray(values) ? values : values !== undefined && values !== null && values !== '' ? [values] :
        legacyValue !== undefined && legacyValue !== null && legacyValue !== '' ? [legacyValue] : [];
    const ids = source.map(Number);
    if (ids.some(id => !Number.isInteger(id) || id < 1)) return null;
    return [...new Set(ids)];
};

const parseSeminarHallTimeMinutes = value => {
    const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
    if (!match) return null;
    let hour = Number(match[1]);
    const minute = Number(match[2]);
    if (minute > 59) return null;
    if (match[3]) {
        if (hour < 1 || hour > 12) return null;
        hour = hour % 12 + (match[3].toUpperCase() === 'PM' ? 12 : 0);
    } else if (hour > 23) {
        return null;
    }
    return hour * 60 + minute;
};

const getSeminarHallRequests = async (req, res) => {
    try {
        const columns = await getSeminarHallRequestColumns();
        const column = (candidates, alias) => {
            const name = candidates.find(candidate => columns.has(candidate));
            return name ? `\`${name}\` AS \`${alias}\`` : `NULL AS \`${alias}\``;
        };
        const organizerColumn = columns.has('organizer')
            ? columns.has('requested_by_name')
                ? `COALESCE(NULLIF(organizer, ''), requested_by_name) AS organizer`
                : 'organizer AS organizer'
            : column(['requested_by_name', 'created_by_name'], 'organizer');
        const [requests] = await masterPool.query(
            `SELECT id, ${column(['event_name', 'event_title'], 'event_name')},
                    ${organizerColumn}, hall_name,
                    ${column(['request_type'], 'request_type')},
                    ${column(['club_id'], 'club_id')},
                    ${column(['club_ids'], 'club_ids')},
                    ${column(['college_id'], 'college_id')},
                    ${column(['college_ids'], 'college_ids')},
                    ${column(['course_id'], 'course_id')},
                    ${column(['course_ids'], 'course_ids')},
                    ${column(['branch_id'], 'branch_id')},
                    ${column(['branch_ids'], 'branch_ids')},
                    ${column(['year_number'], 'year_number')},
                    ${column(['year_numbers'], 'year_numbers')},
                    DATE_FORMAT(event_date, '%Y-%m-%d') AS event_date,
                    start_time, end_time, purpose, ${column(['equipment_needed'], 'equipment_needed')},
                    expected_attendees, status, admin_remarks,
                    ${column(['created_by', 'requested_by_id'], 'created_by')},
                    ${column(['created_by_name', 'requested_by_name'], 'created_by_name')},
                    ${column(['reviewed_by'], 'reviewed_by')},
                    ${column(['request_date', 'created_at'], 'request_date')}, reviewed_at
             FROM seminar_hall_requests
             ORDER BY ${columns.has('request_date') ? 'request_date' : 'created_at'} DESC, id DESC`
        );

        const parseIds = (value, fallback) => {
            if (Array.isArray(value)) return value.map(Number).filter(Number.isInteger);
            if (typeof value === 'string') {
                try {
                    const parsed = JSON.parse(value);
                    if (Array.isArray(parsed)) return parsed.map(Number).filter(Number.isInteger);
                } catch (error) {
                    return fallback ? [Number(fallback)] : [];
                }
            }
            return fallback ? [Number(fallback)] : [];
        };
        const uniqueIds = values => [...new Set(values.flat().filter(value => value !== null && value !== undefined && value !== '').map(String))];
        const idsByField = {
            club: uniqueIds(requests.map(request => parseIds(request.club_ids, request.club_id))),
            college: uniqueIds(requests.map(request => parseIds(request.college_ids, request.college_id))),
            course: uniqueIds(requests.map(request => parseIds(request.course_ids, request.course_id))),
            branch: uniqueIds(requests.map(request => parseIds(request.branch_ids, request.branch_id))),
            user: uniqueIds(requests.flatMap(request => [request.created_by, request.reviewed_by]))
        };
        const getNames = async (table, ids) => {
            if (ids.length === 0) return new Map();
            const [rows] = await masterPool.query(
                `SELECT id, name FROM ${table} WHERE id IN (${ids.map(() => '?').join(', ')})`,
                ids
            );
            return new Map(rows.map(row => [String(row.id), row.name]));
        };
        const [clubNames, collegeNames, courseNames, branchNames] = await Promise.all([
            getNames('clubs', idsByField.club),
            getNames('colleges', idsByField.college),
            getNames('courses', idsByField.course),
            getNames('course_branches', idsByField.branch)
        ]);
        const userNames = new Map();
        if (idsByField.user.length > 0) {
            const [users] = await masterPool.query(
                `SELECT id, name, username, email FROM rbac_users WHERE id IN (${idsByField.user.map(() => '?').join(', ')})`,
                idsByField.user
            );
            users.forEach(user => userNames.set(String(user.id), user.name || user.username || user.email));
        }
        const data = requests.map(request => {
            const clubIds = parseIds(request.club_ids, request.club_id);
            const collegeIds = parseIds(request.college_ids, request.college_id);
            const courseIds = parseIds(request.course_ids, request.course_id);
            const branchIds = parseIds(request.branch_ids, request.branch_id);
            const years = parseIds(request.year_numbers, request.year_number);
            const audienceDetails = request.request_type === 'college'
                ? [
                    ...collegeIds.map(id => collegeNames.get(String(id))).filter(Boolean),
                    ...courseIds.map(id => courseNames.get(String(id))).filter(Boolean),
                    ...branchIds.map(id => branchNames.get(String(id))).filter(Boolean),
                    ...years.map(year => `Year ${year}`)
                ]
                : clubIds.map(id => clubNames.get(String(id))).filter(Boolean);
            return {
                ...request,
                audience_details: audienceDetails.join(' · '),
                requested_by_name: userNames.get(String(request.created_by)) || request.created_by_name || null,
                reviewed_by_name: userNames.get(String(request.reviewed_by)) || null
            };
        });
        res.json({ success: true, data });
    } catch (error) {
        console.error('Error fetching seminar hall requests:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch seminar hall requests' });
    }
};

const getSeminarHallAudienceEstimate = async (req, res) => {
    const { requestType, clubIds, clubId, collegeIds, collegeId, courseIds, courseId, branchIds, branchId, yearNumbers, yearNumber } = req.body;
    try {
        if (requestType === 'club') {
            const selectedClubIds = normalizeSeminarAudienceIds(clubIds, clubId);
            if (!selectedClubIds || selectedClubIds.length === 0) {
                return res.status(400).json({ success: false, message: 'Select a club to estimate attendees' });
            }
            const clubPlaceholders = selectedClubIds.map(() => '?').join(', ');
            const [activeClubs] = await masterPool.execute(
                `SELECT id FROM clubs WHERE id IN (${clubPlaceholders}) AND is_active = 1`,
                selectedClubIds
            );
            if (activeClubs.length !== selectedClubIds.length) return res.status(404).json({ success: false, message: 'One or more selected clubs were not found' });
            const [[result]] = await masterPool.execute(
                `SELECT COUNT(DISTINCT student_id) AS count FROM club_members
                 WHERE club_id IN (${clubPlaceholders}) AND status = 'approved'`,
                selectedClubIds
            );
            return res.json({ success: true, estimatedCount: Number(result.count) || 0 });
        }

        if (requestType !== 'college') {
            return res.status(400).json({ success: false, message: 'Select a valid request type' });
        }
        const selectedCollegeIds = normalizeSeminarAudienceIds(collegeIds, collegeId);
        const selectedCourseIds = normalizeSeminarAudienceIds(courseIds, courseId);
        const selectedBranchIds = normalizeSeminarAudienceIds(branchIds, branchId);
        const selectedYearNumbers = normalizeSeminarAudienceIds(yearNumbers, yearNumber);
        if (!selectedCollegeIds || selectedCollegeIds.length === 0 || !selectedCourseIds || !selectedBranchIds || !selectedYearNumbers ||
            (selectedBranchIds.length > 0 && selectedCourseIds.length === 0)) {
            return res.status(400).json({ success: false, message: 'Select a valid college, course, and branch scope' });
        }

        const collegePlaceholders = selectedCollegeIds.map(() => '?').join(', ');
        const [selectedColleges] = await masterPool.execute(
            `SELECT id FROM colleges WHERE id IN (${collegePlaceholders})`,
            selectedCollegeIds
        );
        if (selectedColleges.length !== selectedCollegeIds.length) return res.status(404).json({ success: false, message: 'One or more selected colleges were not found' });
        const coursePlaceholders = selectedCourseIds.map(() => '?').join(', ');
        if (selectedCourseIds.length > 0) {
            const [validCourses] = await masterPool.execute(
                `SELECT id FROM courses WHERE id IN (${coursePlaceholders}) AND college_id IN (${collegePlaceholders})`,
                [...selectedCourseIds, ...selectedCollegeIds]
            );
            if (validCourses.length !== selectedCourseIds.length) return res.status(400).json({ success: false, message: 'Every selected course must belong to a selected college' });
        }
        const branchPlaceholders = selectedBranchIds.map(() => '?').join(', ');
        if (selectedBranchIds.length > 0) {
            const [validBranches] = await masterPool.execute(
                `SELECT id FROM course_branches WHERE id IN (${branchPlaceholders}) AND course_id IN (${coursePlaceholders})`,
                [...selectedBranchIds, ...selectedCourseIds]
            );
            if (validBranches.length !== selectedBranchIds.length) return res.status(400).json({ success: false, message: 'Every selected branch must belong to a selected course' });
        }
        if (selectedYearNumbers.some(year => year > 10)) {
            return res.status(400).json({ success: false, message: 'Select a valid study year' });
        }

        let query = `SELECT COUNT(DISTINCT id) AS count FROM students
                 WHERE student_status = 'Regular' AND college_id IN (${collegePlaceholders})`;
        const params = [...selectedCollegeIds];
        if (selectedCourseIds.length > 0) {
            query += ` AND course_id IN (${coursePlaceholders})`;
            params.push(...selectedCourseIds);
        }
        if (selectedBranchIds.length > 0) {
            query += ` AND branch_id IN (${branchPlaceholders})`;
            params.push(...selectedBranchIds);
        }
        if (selectedYearNumbers.length > 0) {
            query += ` AND current_year IN (${selectedYearNumbers.map(() => '?').join(', ')})`;
            params.push(...selectedYearNumbers);
        }
        const [[result]] = await masterPool.execute(query, params);
        return res.json({ success: true, estimatedCount: Number(result.count) || 0 });
    } catch (error) {
        console.error('Error estimating seminar hall attendees:', error);
        return res.status(500).json({ success: false, message: 'Failed to estimate attendees' });
    }
};

const createSeminarHallRequest = async (req, res) => {
    const {
        eventName,
        organizer,
        hallName,
        eventDate,
        startTime,
        endTime,
        purpose,
        expectedAttendees,
        requestType = 'club',
        clubIds,
        clubId,
        collegeIds,
        collegeId,
        courseIds,
        courseId,
        branchIds,
        branchId,
        yearNumbers,
        yearNumber
    } = req.body;

    if (!eventName?.trim() || !organizer?.trim() || !hallName?.trim() || !eventDate ||
        !startTime || !endTime || !purpose?.trim()) {
        return res.status(400).json({ success: false, message: 'Complete all required request fields' });
    }
    const requestedStartMinutes = parseSeminarHallTimeMinutes(startTime);
    const requestedEndMinutes = parseSeminarHallTimeMinutes(endTime);
    if (requestedStartMinutes === null || requestedEndMinutes === null || requestedStartMinutes >= requestedEndMinutes) {
        return res.status(400).json({ success: false, message: 'Provide a valid time range with the end after the start' });
    }
    if (!['club', 'college'].includes(requestType)) {
        return res.status(400).json({ success: false, message: 'Select a valid request type' });
    }
    const selectedClubIds = normalizeSeminarAudienceIds(clubIds, clubId);
    const selectedCollegeIds = normalizeSeminarAudienceIds(collegeIds, collegeId);
    const selectedCourseIds = normalizeSeminarAudienceIds(courseIds, courseId);
    const selectedBranchIds = normalizeSeminarAudienceIds(branchIds, branchId);
    const selectedYearNumbers = requestType === 'college'
        ? normalizeSeminarAudienceIds(yearNumbers, yearNumber)
        : [];
    if (!selectedClubIds || !selectedCollegeIds || !selectedCourseIds || !selectedBranchIds ||
        !selectedYearNumbers || selectedYearNumbers.some(year => year > 10) ||
        (requestType === 'club' && selectedClubIds.length === 0) ||
        (requestType === 'college' && selectedCollegeIds.length === 0) ||
        (requestType === 'college' && selectedBranchIds.length > 0 && selectedCourseIds.length === 0) ||
        (requestType === 'club' && selectedYearNumbers.length > 0)) {
        return res.status(400).json({ success: false, message: 'Select the required request audience' });
    }
    const numericClubId = requestType === 'club' ? selectedClubIds[0] : null;
    const numericCollegeId = requestType === 'college' ? selectedCollegeIds[0] : null;
    const numericCourseId = requestType === 'college' ? selectedCourseIds[0] || null : null;
    const numericBranchId = requestType === 'college' ? selectedBranchIds[0] || null : null;
    const normalizedExpectedAttendees = expectedAttendees === '' || expectedAttendees === null || expectedAttendees === undefined
        ? null
        : Number(expectedAttendees);
    if (normalizedExpectedAttendees !== null &&
        (!Number.isInteger(normalizedExpectedAttendees) || normalizedExpectedAttendees < 0)) {
        return res.status(400).json({ success: false, message: 'Estimated attendee count must be a non-negative whole number' });
    }

    try {
        if (requestType === 'college') {
            const collegePlaceholders = selectedCollegeIds.map(() => '?').join(', ');
            const [validColleges] = await masterPool.execute(
                `SELECT id FROM colleges WHERE id IN (${collegePlaceholders})`,
                selectedCollegeIds
            );
            if (validColleges.length !== selectedCollegeIds.length) return res.status(400).json({ success: false, message: 'One or more selected colleges were not found' });
            if (selectedCourseIds.length > 0) {
                const coursePlaceholders = selectedCourseIds.map(() => '?').join(', ');
                const [validCourses] = await masterPool.execute(
                    `SELECT id FROM courses WHERE id IN (${coursePlaceholders}) AND college_id IN (${collegePlaceholders})`,
                    [...selectedCourseIds, ...selectedCollegeIds]
                );
                if (validCourses.length !== selectedCourseIds.length) return res.status(400).json({ success: false, message: 'Every selected course must belong to a selected college' });
            }
            if (selectedBranchIds.length > 0) {
                const branchPlaceholders = selectedBranchIds.map(() => '?').join(', ');
                const coursePlaceholders = selectedCourseIds.map(() => '?').join(', ');
                const [validBranches] = await masterPool.execute(
                    `SELECT id FROM course_branches WHERE id IN (${branchPlaceholders}) AND course_id IN (${coursePlaceholders})`,
                    [...selectedBranchIds, ...selectedCourseIds]
                );
                if (validBranches.length !== selectedBranchIds.length) return res.status(400).json({ success: false, message: 'Every selected branch must belong to a selected course' });
            }
        } else {
            const clubPlaceholders = selectedClubIds.map(() => '?').join(', ');
            const [validClubs] = await masterPool.execute(
                `SELECT id FROM clubs WHERE id IN (${clubPlaceholders}) AND is_active = 1`,
                selectedClubIds
            );
            if (validClubs.length !== selectedClubIds.length) return res.status(400).json({ success: false, message: 'One or more selected clubs were not found' });
        }
        const columns = await getSeminarHallRequestColumns();
        const [[hall]] = await masterPool.execute(
            'SELECT open_time, close_time FROM seminar_halls WHERE hall_name = ? AND is_active = 1 LIMIT 1',
            [hallName.trim()]
        );
        if (!hall) return res.status(400).json({ success: false, message: 'Selected seminar hall is not active' });
        const hallOpenMinutes = parseSeminarHallTimeMinutes(hall.open_time);
        const hallCloseMinutes = parseSeminarHallTimeMinutes(hall.close_time);
        if (hallOpenMinutes === null || hallCloseMinutes === null ||
            requestedStartMinutes < hallOpenMinutes || requestedEndMinutes > hallCloseMinutes) {
            return res.status(400).json({ success: false, message: 'Requested time must be within the seminar hall opening hours' });
        }

        const eventTitleColumn = columns.has('event_title') ? 'event_title' : 'event_name';
        const [sameDayRequests] = await masterPool.execute(
            `SELECT id, ${eventTitleColumn} AS event_title, start_time, end_time, status
             FROM seminar_hall_requests
             WHERE hall_name = ? AND event_date = ? AND status IN ('pending', 'approved')`,
            [hallName.trim(), eventDate]
        );
        const conflictingRequests = sameDayRequests.filter(request => {
            const existingStart = parseSeminarHallTimeMinutes(request.start_time);
            const existingEnd = parseSeminarHallTimeMinutes(request.end_time);
            return existingStart !== null && existingEnd !== null &&
                existingStart < requestedEndMinutes && existingEnd > requestedStartMinutes;
        });
        if (conflictingRequests.length > 0) {
            return res.status(409).json({
                success: false,
                message: `This time overlaps an existing ${conflictingRequests.some(request => request.status === 'approved') ? 'approved booking' : 'pending request'} for ${hallName}`,
                conflicts: conflictingRequests.map(request => ({
                    eventName: request.event_title,
                    startTime: request.start_time,
                    endTime: request.end_time,
                    status: request.status
                }))
            });
        }

        const valuesByColumn = new Map();
        const addColumn = (candidates, value) => {
            const name = candidates.find(candidate => columns.has(candidate));
            if (name && !valuesByColumn.has(name)) valuesByColumn.set(name, value);
            return name;
        };
        addColumn(['request_type'], requestType);
        addColumn(['club_id'], numericClubId);
        addColumn(['club_ids'], requestType === 'club' ? JSON.stringify(selectedClubIds) : null);
        addColumn(['college_id'], numericCollegeId);
        addColumn(['college_ids'], requestType === 'college' ? JSON.stringify(selectedCollegeIds) : null);
        addColumn(['course_id'], numericCourseId);
        addColumn(['course_ids'], requestType === 'college' ? JSON.stringify(selectedCourseIds) : null);
        addColumn(['branch_id'], numericBranchId);
        addColumn(['branch_ids'], requestType === 'college' ? JSON.stringify(selectedBranchIds) : null);
        addColumn(['year_number'], selectedYearNumbers[0] || null);
        addColumn(['year_numbers'], requestType === 'college' ? JSON.stringify(selectedYearNumbers) : null);
        addColumn(['event_name', 'event_title'], eventName.trim());
        addColumn(['organizer'], organizer.trim());
        addColumn(['requested_by_name', 'created_by_name'], req.user.name || req.user.username || req.user.email || 'Administrator');
        addColumn(['hall_name'], hallName.trim());
        addColumn(['event_date'], eventDate);
        addColumn(['start_time'], startTime);
        addColumn(['end_time'], endTime);
        addColumn(['purpose'], purpose.trim());
        addColumn(['expected_attendees'], normalizedExpectedAttendees);
        addColumn(['status'], 'pending');
        addColumn(['created_by', 'requested_by_id'], req.user.id);
        addColumn(['requested_by_role'], 'Admin');
        addColumn(['equipment_needed'], '');

        const insertColumns = [...valuesByColumn.keys()];
        const placeholders = insertColumns.map(() => '?').join(', ');
        const [result] = await masterPool.execute(
            `INSERT INTO seminar_hall_requests (${insertColumns.map(name => `\`${name}\``).join(', ')})
             VALUES (${placeholders})`,
            insertColumns.map(name => valuesByColumn.get(name))
        );
        res.status(201).json({ success: true, message: 'Seminar hall request created', id: result.insertId });
    } catch (error) {
        console.error('Error creating seminar hall request:', error);
        res.status(500).json({ success: false, message: 'Failed to create seminar hall request' });
    }
};

const updateSeminarHallRequestStatus = async (req, res) => {
    const { status, adminRemarks = '' } = req.body;
    if (!['approved', 'rejected'].includes(status)) {
        return res.status(400).json({ success: false, message: 'Status must be approved or rejected' });
    }

    try {
        const [result] = await masterPool.execute(
            `UPDATE seminar_hall_requests
             SET status = ?, admin_remarks = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
             WHERE id = ? AND status = 'pending'`,
            [status, String(adminRemarks).trim(), req.user.id, req.params.requestId]
        );
        if (result.affectedRows === 0) {
            return res.status(409).json({ success: false, message: 'Request not found or already reviewed' });
        }
        res.json({ success: true, message: `Seminar hall request ${status}` });
    } catch (error) {
        console.error('Error updating seminar hall request:', error);
        res.status(500).json({ success: false, message: 'Failed to update seminar hall request' });
    }
};

module.exports = {
    createClub,
    getClubs,
    getClubImage,
    joinClub,
    updateMembershipStatus,
    createActivity,
    getClubDetails,
    updateClub,
    deleteClub,
    updateActivity,
    deleteActivity,
    toggleClubStatus,
    getClubRoles,
    createClubRole,
    updateClubRole,
    deleteClubRole,
    checkHrmsUserAccount,
    getAllClubApprovals,
    getAllClubStudents,
    getSeminarHalls,
    createSeminarHall,
    updateSeminarHall,
    deleteSeminarHall,
    getSeminarHallRequests,
    getSeminarHallAudienceEstimate,
    createSeminarHallRequest,
    updateSeminarHallRequestStatus
};
