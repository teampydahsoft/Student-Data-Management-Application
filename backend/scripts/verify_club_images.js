const { masterPool } = require('../config/database');

async function verifyClubImages() {
    try {
        const [clubs] = await masterPool.query(
            `SELECT name,
                    CASE
                        WHEN image_url LIKE 'data:%' THEN CONCAT('DB base64 (', ROUND(CHAR_LENGTH(image_url) / 1024), ' KB)')
                        WHEN image_url LIKE '/%' THEN CONCAT('LOCAL PATH (needs fix): ', image_url)
                        WHEN image_url IS NULL OR image_url = '' THEN 'MISSING'
                        ELSE CONCAT('OTHER: ', LEFT(image_url, 40))
                    END AS storage
             FROM clubs
             ORDER BY name`
        );

        console.table(clubs);

        const bad = clubs.filter((c) => !c.storage.startsWith('DB base64'));
        if (bad.length) {
            console.error('\nSome clubs are not using DB-stored images.');
            process.exit(1);
        }

        console.log('\nAll club images are stored in the database.');
        process.exit(0);
    } catch (error) {
        console.error('Verification failed:', error);
        process.exit(1);
    }
}

verifyClubImages();
