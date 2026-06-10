const { masterPool } = require('../config/database');
const { CLUBS, getClubImageDataUrl } = require('./clubImageUtils');

async function seedClubs() {
    try {
        console.log('Seeding campus clubs (images stored as base64 in DB)...');

        for (const club of CLUBS) {
            const [existing] = await masterPool.query('SELECT id, image_url FROM clubs WHERE name = ?', [club.name]);
            const keepExistingImage = club.skipImageUpdate && existing.length > 0 && existing[0].image_url?.startsWith('data:');
            const imageDataUrl = keepExistingImage ? existing[0].image_url : await getClubImageDataUrl(club);

            if (existing.length > 0) {
                await masterPool.query(
                    'UPDATE clubs SET description = ?, image_url = ?, is_active = TRUE WHERE id = ?',
                    [club.description, imageDataUrl, existing[0].id]
                );
                console.log(
                    keepExistingImage
                        ? `Updated: ${club.name} (kept existing DB image)`
                        : `Updated: ${club.name} (${Math.round(imageDataUrl.length / 1024)} KB image in DB)`
                );
            } else {
                await masterPool.query(
                    `INSERT INTO clubs (name, description, image_url, form_fields, members, activities, is_active, membership_fee, fee_type)
                     VALUES (?, ?, ?, ?, ?, ?, TRUE, 0, 'Yearly')`,
                    [
                        club.name,
                        club.description,
                        imageDataUrl,
                        JSON.stringify([]),
                        JSON.stringify([]),
                        JSON.stringify([]),
                    ]
                );
                console.log(`Created: ${club.name} (${Math.round(imageDataUrl.length / 1024)} KB image in DB)`);
            }
        }

        const [all] = await masterPool.query(
            `SELECT id, name,
                    LEFT(description, 50) AS desc_preview,
                    CASE WHEN image_url LIKE 'data:%' THEN CONCAT('base64 (', ROUND(CHAR_LENGTH(image_url)/1024), ' KB)')
                         ELSE image_url END AS image_storage
             FROM clubs ORDER BY name`
        );
        console.log('\nClubs in database:');
        console.table(all);
        console.log('Club seeding completed — all thumbnails stored in image_url column.');
        process.exit(0);
    } catch (error) {
        console.error('Error seeding clubs:', error);
        process.exit(1);
    }
}

seedClubs();
