const webpush = require('web-push');
const { masterPool } = require('../config/database');

// Configure web-push
webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
);

// Helper to remove invalid/expired push subscriptions from database
const removeExpiredSubscription = async (endpoint) => {
    if (!endpoint) return;
    try {
        await masterPool.query('DELETE FROM push_subscriptions WHERE endpoint = ?', [endpoint]);
        console.log(`🧹 Removed expired push subscription: ${endpoint.substring(0, 50)}...`);
    } catch (err) {
        console.error('Error removing expired subscription:', err.message);
    }
};

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
    const userId = req.user ? req.user.id : null;

    if (!subscription || !subscription.endpoint) {
        return res.status(400).json({ success: false, message: 'Invalid subscription object' });
    }

    try {
        const [existing] = await masterPool.query(
            'SELECT id FROM push_subscriptions WHERE endpoint = ?',
            [subscription.endpoint]
        );

        const keysAuth = subscription.keys ? subscription.keys.auth : '';
        const keysP256dh = subscription.keys ? subscription.keys.p256dh : '';

        if (existing.length > 0) {
            await masterPool.query(
                'UPDATE push_subscriptions SET user_id = ?, keys_auth = ?, keys_p256dh = ? WHERE endpoint = ?',
                [userId, keysAuth, keysP256dh, subscription.endpoint]
            );
        } else {
            await masterPool.query(
                'INSERT INTO push_subscriptions (user_id, endpoint, keys_auth, keys_p256dh) VALUES (?, ?, ?, ?)',
                [userId, subscription.endpoint, keysAuth, keysP256dh]
            );
        }

        res.status(201).json({ success: true, message: 'Subscription added successfully' });
    } catch (error) {
        console.error('Error saving subscription:', error);
        res.status(500).json({ success: false, message: 'Failed to save subscription' });
    }
};

// Send Notification to specific user (internal utility)
exports.sendNotificationToUser = async (userId, payload) => {
    try {
        const [subscriptions] = await masterPool.query(
            'SELECT * FROM push_subscriptions WHERE user_id = ?',
            [userId]
        );

        if (subscriptions.length === 0) {
            return { success: false, message: 'No subscriptions found for user' };
        }

        const stringPayload = JSON.stringify(payload);
        const results = await Promise.allSettled(
            subscriptions.map(async (sub) => {
                const pushSubscription = {
                    endpoint: sub.endpoint,
                    keys: {
                        auth: sub.keys_auth,
                        p256dh: sub.keys_p256dh
                    }
                };
                try {
                    return await webpush.sendNotification(pushSubscription, stringPayload);
                } catch (err) {
                    if (err.statusCode === 410 || err.statusCode === 404) {
                        await removeExpiredSubscription(sub.endpoint);
                    }
                    throw err;
                }
            })
        );

        const successful = results.filter(r => r.status === 'fulfilled');
        if (successful.length > 0) {
            return { success: true, sent: successful.length, total: subscriptions.length };
        }

        const firstError = results.find(r => r.status === 'rejected')?.reason;
        return {
            success: false,
            message: firstError?.message || 'All push deliveries failed',
            error: firstError
        };
    } catch (error) {
        console.error('Error sending notification:', error);
        return { success: false, error: error.message || error };
    }
};

// Broadcast Notification (Admin only)
exports.broadcastNotification = async (req, res) => {
    const payload = req.body;

    if (!payload || !payload.title) {
        return res.status(400).json({ success: false, message: 'Invalid payload' });
    }

    try {
        const [subscriptions] = await masterPool.query('SELECT * FROM push_subscriptions');
        const stringPayload = JSON.stringify(payload);

        let sentCount = 0;
        const chunkSize = 50;
        for (let i = 0; i < subscriptions.length; i += chunkSize) {
            const chunk = subscriptions.slice(i, i + chunkSize);
            await Promise.allSettled(
                chunk.map(async (sub) => {
                    const pushSubscription = {
                        endpoint: sub.endpoint,
                        keys: {
                            auth: sub.keys_auth,
                            p256dh: sub.keys_p256dh
                        }
                    };
                    try {
                        await webpush.sendNotification(pushSubscription, stringPayload);
                        sentCount++;
                    } catch (err) {
                        if (err.statusCode === 410 || err.statusCode === 404) {
                            await removeExpiredSubscription(sub.endpoint);
                        }
                    }
                })
            );
        }

        res.json({ success: true, message: 'Broadcast sent', sentCount });
    } catch (error) {
        console.error('Error broadcasting:', error);
        res.status(500).json({ success: false, message: 'Broadcast failed' });
    }
};

// Batch Notification (Internal)
exports.sendBatchNotification = async (userIds, payload) => {
    if (!userIds || userIds.length === 0) return { success: true, sent: 0 };

    try {
        const [subscriptions] = await masterPool.query(
            'SELECT * FROM push_subscriptions WHERE user_id IN (?)',
            [userIds]
        );

        if (subscriptions.length === 0) return { success: true, sent: 0 };

        const stringPayload = JSON.stringify(payload);
        let sentCount = 0;
        const chunkSize = 50;
        for (let i = 0; i < subscriptions.length; i += chunkSize) {
            const chunk = subscriptions.slice(i, i + chunkSize);
            await Promise.allSettled(
                chunk.map(async (sub) => {
                    const pushSubscription = {
                        endpoint: sub.endpoint,
                        keys: {
                            auth: sub.keys_auth,
                            p256dh: sub.keys_p256dh
                        }
                    };
                    try {
                        await webpush.sendNotification(pushSubscription, stringPayload);
                        sentCount++;
                    } catch (err) {
                        if (err.statusCode === 410 || err.statusCode === 404) {
                            await removeExpiredSubscription(sub.endpoint);
                        }
                    }
                })
            );
        }

        return { success: true, sent: sentCount };
    } catch (error) {
        console.error('Batch push error:', error);
        return { success: false, error: error.message || error };
    }
};
