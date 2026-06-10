const fs = require('fs');
const path = require('path');
const https = require('https');
const { masterPool } = require('../config/database');

const CLUBS = [
    {
        name: 'Quantum Coders',
        slug: 'quantum-coders',
        description:
            'Dive into programming, competitive coding, and software innovation. Quantum Coders hosts hackathons, coding contests, tech workshops, and collaborative dev projects to sharpen your problem-solving skills.',
        imageUrl: 'https://images.unsplash.com/photo-1516116216624-53e697fedbea?w=600&h=400&fit=crop&q=80',
    },
    {
        name: 'Aqua Green',
        slug: 'aqua-green',
        description:
            'Championing sustainability and environmental stewardship on campus. Aqua Green organizes tree plantations, eco-awareness drives, waste management initiatives, and green campus projects for a healthier tomorrow.',
        imageUrl: 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=600&h=400&fit=crop&q=80',
    },
    {
        name: 'Bibliophiles',
        slug: 'bibliophiles',
        description:
            'A haven for book lovers and literary enthusiasts. Join reading circles, author discussions, poetry sessions, and book exchanges to explore stories, ideas, and the joy of reading together.',
        imageUrl: 'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=600&h=400&fit=crop&q=80',
    },
    {
        name: 'Melodia',
        slug: 'melodia',
        description:
            'Where music comes alive! Melodia brings together singers, instrumentalists, and music lovers for jam sessions, cultural performances, choir practices, and campus concerts that celebrate creativity.',
        imageUrl: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=600&h=400&fit=crop&q=80',
    },
    {
        name: 'Impact Orators',
        slug: 'impact-orators',
        description:
            'Master the art of public speaking and persuasive communication. Impact Orators trains members through debates, elocution, mock parliaments, TED-style talks, and leadership speaking contests.',
        imageUrl: 'https://images.unsplash.com/photo-1475721027785-f74eccf877e2?w=600&h=400&fit=crop&q=80',
    },
    {
        name: 'Project Studio',
        slug: 'project-studio',
        description:
            'Turn ideas into reality with hands-on innovation. Project Studio supports student-led engineering projects, prototype development, maker workshops, and interdisciplinary collaborations from concept to completion.',
        imageUrl: 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=600&h=400&fit=crop&q=80',
    },
    {
        name: 'Yuva Sadhvi',
        slug: 'yuva-sadhvi',
        description:
            'Nurturing discipline, mindfulness, and holistic wellness among youth. Yuva Sadhvi offers yoga sessions, meditation practices, spiritual discourses, and wellness programs for balanced student life.',
        imageUrl: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=600&h=400&fit=crop&q=80',
    },
    {
        name: 'Life Savers',
        slug: 'life-savers',
        description:
            'Empowering students with lifesaving skills and health awareness. Life Savers conducts first-aid training, CPR workshops, blood donation camps, and health camps to build a safety-conscious campus.',
        imageUrl: 'https://images.unsplash.com/photo-1579684385127-1ef15d508118?w=600&h=400&fit=crop&q=80',
    },
];

const LOCAL_IMAGES_DIR = path.join(__dirname, '../../frontend/public/clubs');

function downloadImageToBuffer(url) {
    return new Promise((resolve, reject) => {
        https
            .get(url, (response) => {
                if (response.statusCode === 301 || response.statusCode === 302) {
                    return downloadImageToBuffer(response.headers.location).then(resolve).catch(reject);
                }
                if (response.statusCode !== 200) {
                    return reject(new Error(`Failed to download ${url}: HTTP ${response.statusCode}`));
                }
                const chunks = [];
                response.on('data', (chunk) => chunks.push(chunk));
                response.on('end', () => resolve(Buffer.concat(chunks)));
            })
            .on('error', reject);
    });
}

async function getImageDataUrl(club) {
    const localPath = path.join(LOCAL_IMAGES_DIR, `${club.slug}.jpg`);

    let buffer;
    if (fs.existsSync(localPath)) {
        console.log(`Reading local image: ${club.slug}.jpg`);
        buffer = fs.readFileSync(localPath);
    } else {
        console.log(`Downloading thumbnail: ${club.name}`);
        buffer = await downloadImageToBuffer(club.imageUrl);
    }

    const base64 = buffer.toString('base64');
    return `data:image/jpeg;base64,${base64}`;
}

async function seedClubs() {
    try {
        console.log('Seeding campus clubs (images stored as base64 in DB)...');

        for (const club of CLUBS) {
            const imageDataUrl = await getImageDataUrl(club);
            const [existing] = await masterPool.query('SELECT id FROM clubs WHERE name = ?', [club.name]);

            if (existing.length > 0) {
                await masterPool.query(
                    'UPDATE clubs SET description = ?, image_url = ?, is_active = TRUE WHERE id = ?',
                    [club.description, imageDataUrl, existing[0].id]
                );
                console.log(`Updated: ${club.name} (${Math.round(imageDataUrl.length / 1024)} KB image in DB)`);
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
