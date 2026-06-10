/**
 * Update club thumbnail photos in DB (base64).
 * Usage:
 *   node scripts/update_club_photos.js                  # Aqua Green + Life Savers
 *   node scripts/update_club_photos.js "Quantum Coders" # single club by name
 */
const { masterPool } = require('../config/database');
const { CLUBS, getClubImageDataUrl } = require('./clubImageUtils');

const DEFAULT_CLUBS = ['Aqua Green', 'Life Savers'];

function getTargets(argvNames) {
    if (argvNames.length) return CLUBS.filter((c) => argvNames.includes(c.name));
    return CLUBS.filter((c) => DEFAULT_CLUBS.includes(c.name));
}

async function updateClubPhotos() {
    const targets = getTargets(process.argv.slice(2));
    if (!targets.length) {
        console.error('No matching clubs found for update.');
        process.exit(1);
    }

    try {
        console.log(`Updating photos for: ${targets.map((c) => c.name).join(', ')}`);

        for (const club of targets) {
            const imageDataUrl = await getClubImageDataUrl(club);

            const [existing] = await masterPool.query('SELECT id FROM clubs WHERE name = ?', [club.name]);
            if (!existing.length) {
                console.warn(`Skipped (not in DB): ${club.name}`);
                continue;
            }

            await masterPool.query('UPDATE clubs SET image_url = ? WHERE id = ?', [imageDataUrl, existing[0].id]);
            console.log(`Updated ${club.name} (${Math.round(imageDataUrl.length / 1024)} KB in DB)`);
        }

        process.exit(0);
    } catch (error) {
        console.error('Error updating club photos:', error);
        process.exit(1);
    }
}

updateClubPhotos();
