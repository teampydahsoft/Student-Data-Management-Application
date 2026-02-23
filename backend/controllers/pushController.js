const webpush = require('web-push');
const { masterPool } = require('../config/database');

// Configure web-push
webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
);

// Get VAPID Public Key
exports.getVapidPublicKey = (req, res) => {
    res.status(200).json({
        success: true,
        publicKey: process.env.VAPID_PUBLIC_KEY
    });
};

// Subscribe User
exports.subscribe = async (req, res) => {
    const subscription = req.body;
    const userId = req.user ? req.user.id : null; // Assuming auth middleware adds user to req

    if (!subscription || !subscription.endpoint) {
        return res.status(400).json({ success: false, message: 'Invalid subscription object' });
    }

    let conn = null;
    try {
        conn = await masterPool.getConnection();

        // Check if subscription already exists
        const [existing] = await conn.query(
            'SELECT id FROM push_subscriptions WHERE endpoint = ?',
            [subscription.endpoint]
        );

        const keysAuth = subscription.keys ? subscription.keys.auth : '';
        const keysP256dh = subscription.keys ? subscription.keys.p256dh : '';

        if (existing.length > 0) {
            // Update existing subscription
            await conn.query(
                'UPDATE push_subscriptions SET user_id = ?, keys_auth = ?, keys_p256dh = ? WHERE endpoint = ?',
                [userId, keysAuth, keysP256dh, subscription.endpoint]
            );
        } else {
            // Create new subscription
            await conn.query(
                'INSERT INTO push_subscriptions (user_id, endpoint, keys_auth, keys_p256dh) VALUES (?, ?, ?, ?)',
                [userId, subscription.endpoint, keysAuth, keysP256dh]
            );
        }

        res.status(201).json({ success: true, message: 'Subscription added successfully' });
    } catch (error) {
        console.error('Error saving subscription:', error);
        res.status(500).json({ success: false, message: 'Failed to save subscription' });
    } finally {
        if (conn) conn.release();
    }
};

// Send Notification to specific user (internal utility)
exports.sendNotificationToUser = async (userId, payload) => {
    let conn = null;
    try {
        conn = await masterPool.getConnection();
        const [subscriptions] = await conn.query(
            'SELECT * FROM push_subscriptions WHERE user_id = ?',
            [userId]
        );
        conn.release();

        if (subscriptions.length === 0) {
            return { success: false, message: 'No subscriptions found for user' };
        }

        const notifications = subscriptions.map(sub => {
            const pushSubscription = {
                endpoint: sub.endpoint,
                keys: {
                    auth: sub.keys_auth,
                    p256dh: sub.keys_p256dh
                }
            };
            return webpush.sendNotification(pushSubscription, JSON.stringify(payload));
        });

        await Promise.all(notifications);
        return { success: true };
    } catch (error) {
        console.error('Error sending notification:', error);
        if (conn) conn.release();
        return { success: false, error };
    }
};


// Broadcast Notification (Admin only)
exports.broadcastNotification = async (req, res) => {
    const payload = req.body;

    if (!payload || !payload.title) {
        return res.status(400).json({ success: false, message: 'Invalid payload' });
    }

    let conn = null;
    try {
        conn = await masterPool.getConnection();
        const [subscriptions] = await conn.query('SELECT * FROM push_subscriptions');
        conn.release();

        const notifications = subscriptions.map(sub => {
            const pushSubscription = {
                endpoint: sub.endpoint,
                keys: {
                    auth: sub.keys_auth,
                    p256dh: sub.keys_p256dh
                }
            };

            return webpush.sendNotification(pushSubscription, JSON.stringify(payload))
                .catch(err => {
                    if (err.statusCode === 410 || err.statusCode === 404) {
                        // Subscription is no longer valid, remove from DB
                        // We'd ideally do this in a separate process or queue
                        console.log('Subscription expired, should delete:', sub.id);
                        // For now, just log it.
                    }
                    console.error('Error sending to subscription:', err);
                });
        });

        await Promise.all(notifications);
        res.json({ success: true, message: 'Broadcast sent' });

    } catch (error) {
        console.error('Error broadcasting:', error);
        if (conn) conn.release();
        res.status(500).json({ success: false, message: 'Broadcast failed' });
    }
};

// Batch Notification (Internal)
exports.sendBatchNotification = async (userIds, payload) => {
    if (!userIds || userIds.length === 0) return { success: true, sent: 0 };

    let conn = null;
    try {
        conn = await masterPool.getConnection();

        // Handle large lists by chunking if necessary, but for now specific IN clause
        // userIds might be large, so ideally we process in chunks or use a temp table, 
        // but let's assume reasonable size for now (< 2000?)

        const [subscriptions] = await conn.query(
            'SELECT * FROM push_subscriptions WHERE user_id IN (?)',
            [userIds]
        );
        conn.release();

        if (subscriptions.length === 0) return { success: true, sent: 0 };

        let sentCount = 0;
        const chunkSize = 100;
        for (let i = 0; i < subscriptions.length; i += chunkSize) {
            const chunk = subscriptions.slice(i, i + chunkSize);
            await Promise.all(chunk.map(sub => {
                const pushSubscription = {
                    endpoint: sub.endpoint,
                    keys: {
                        auth: sub.keys_auth,
                        p256dh: sub.keys_p256dh
                    }
                };
                return webpush.sendNotification(pushSubscription, JSON.stringify(payload))
                    .then(() => { sentCount++; })
                    .catch(err => {
                        if (err.statusCode === 410 || err.statusCode === 404) {
                            // Expired
                        }
                    });
            }));
        }

        return { success: true, sent: sentCount };

    } catch (error) {
        console.error('Batch push error:', error);
        if (conn) conn.release();
        return { success: false, error };
    }
};
