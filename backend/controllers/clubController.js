const { masterPool } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const { sendNotificationToUser } = require('./pushController');
const fs = require('fs');
const Transaction = require('../MongoDb-Models/Transaction');

const StudentFee = require('../MongoDb-Models/StudentFee');
const FeeHead = require('../MongoDb-Models/FeeHead');


const getClubs = async (req, res) => {
    try {
        const { role, id } = req.user;
        const isAdmin = ['admin', 'super_admin'].includes(role);

        // Fetch clubs without transferring large base64 image strings in list JSON
        let query = 'SELECT id, name, description, membership_fee, fee_type, (image_url IS NOT NULL AND image_url != "") as has_image, activities, form_fields, is_active, created_at FROM clubs';
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
        const [clubs] = results[0];
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

        // If student is approved for any club with a fee, fetch transactions once
        let studentTransactions = [];
        const hasApprovedPaidClub = role === 'student' && clubs.some(c => {
            const m = membershipMap[c.id];
            return m && m.status === 'approved' && Number(c.membership_fee) > 0;
        });

        if (hasApprovedPaidClub) {
            try {
                const [sRow] = await masterPool.query('SELECT admission_number FROM students WHERE id = ?', [id]);
                if (sRow.length > 0 && sRow[0].admission_number) {
                    studentTransactions = await Transaction.find({
                        studentId: sRow[0].admission_number,
                        transactionType: 'DEBIT'
                    }).lean();
                }
            } catch (syncErr) {
                console.error('Error syncing club payment status:', syncErr);
            }
        }

        const baseUrl = `${req.protocol}://${req.get('host')}`;

        const enrichedClubs = clubs.map(club => {
            const count = memberCountMap[club.id] || 0;
            const membership = membershipMap[club.id];
            const userStatus = membership ? membership.status : null;
            let paymentStatus = membership ? membership.payment_status : null;

            let paid_amount = 0;
            const requiredFee = Number(club.membership_fee) || 0;
            let balance_due = requiredFee;

            if (userStatus === 'approved' && studentTransactions.length > 0) {
                const clubRegex = new RegExp(club.name, 'i');
                const matchingTxs = studentTransactions.filter(tx => tx.remarks && clubRegex.test(tx.remarks));
                paid_amount = matchingTxs.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
                balance_due = Math.max(0, requiredFee - paid_amount);

                if (paymentStatus === 'payment_due' && paid_amount >= requiredFee && requiredFee > 0) {
                    paymentStatus = 'paid';
                    // Asynchronously update status in background without delaying response
                    masterPool.query('UPDATE club_members SET payment_status = ? WHERE club_id = ? AND student_id = ?', ['paid', club.id, id])
                        .catch(err => console.error('Error updating club payment status:', err));
                }
            }

            const activities = (role === 'admin' || userStatus === 'approved') ? safeParse(club.activities) : [];

            return {
                ...club,
                image_url: club.has_image ? `${baseUrl}/api/clubs/${club.id}/image` : null,
                form_fields: safeParse(club.form_fields),
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
        const { name, description, membership_fee, fee_type } = req.body;

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

        await masterPool.query(
            'INSERT INTO clubs (name, description, image_url, form_fields, members, activities, created_by, membership_fee, fee_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [name, description, image_url, form_fields, members, activities, req.user?.id || null, membership_fee || 0, fee_type || 'Yearly']
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
        // Initially set to 'not_required' - payment only happens after admin approval
        const paymentStatus = 'not_required';

        await masterPool.query(
            'INSERT INTO club_members (club_id, student_id, status, payment_status, fee_type) VALUES (?, ?, ?, ?, ?)',
            [clubId, studentId, 'pending', paymentStatus, feeType]
        );

        // Notify Club Creator (Admin/Faculty)
        // In this simplified version, we assume created_by is the user ID of the admin.
        // We need to fetch the admin ID who created the club.
        if (club.created_by) {
            sendNotificationToUser(club.created_by, {
                title: `New Join Request: ${req.user.name}`,
                body: `${req.user.name} wants to join ${club.name}. Review request.`,
                icon: '/icon-192x192.png',
                data: { url: '/admin/clubs' } // Adjust URL as needed
            }).catch(console.error);
        }

        res.json({ success: true, message: 'Join request sent successfully' });
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
                'UPDATE club_members SET status = ?, payment_status = ?, fee_type = ? WHERE club_id = ? AND student_id = ?',
                [status, newPaymentStatus, feeType, clubId, studentId]
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
                'UPDATE club_members SET status = ?, payment_status = ? WHERE club_id = ? AND student_id = ?',
                [status, 'NA', clubId, studentId]
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

        // Fetch members from relation table
        const [members] = await masterPool.query(
            `SELECT cm.id, cm.club_id, cm.student_id, cm.status, cm.payment_status, 
                    cm.fee_type, cm.joined_at, cm.updated_at,
                    s.student_name, s.admission_number, s.student_photo,
                    s.college, s.course, s.branch, s.current_year, s.current_semester
             FROM club_members cm 
             JOIN students s ON cm.student_id = s.id 
             WHERE cm.club_id = ?
             ORDER BY cm.joined_at DESC`,
            [clubId]
        );

        const parsedClub = {
            ...club,
            form_fields: safeParse(club.form_fields),
            members: members, // Now array of objects from DB
            activities: safeParse(club.activities)
        };

        res.json({ success: true, data: parsedClub });

    } catch (error) {
        console.error('Error fetching club details:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch club details' });
    }
}

const updateClub = async (req, res) => {
    try {
        const { clubId } = req.params;
        const { name, description, membership_fee, fee_type } = req.body;

        // Build update query dynamically
        let query = 'UPDATE clubs SET name = ?, description = ?, membership_fee = ?, fee_type = ?';
        let params = [name, description, membership_fee || 0, fee_type || 'Yearly'];



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
    toggleClubStatus
};
