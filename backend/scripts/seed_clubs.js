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

const PUBLIC_CLUBS_DIR = path.join(__dirname, '../../frontend/public/clubs');

function downloadImage(url, destPath) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(destPath);
        https
            .get(url, (response) => {
                if (response.statusCode === 301 || response.statusCode === 302) {
                    file.close();
                    fs.unlinkSync(destPath);
                    return downloadImage(response.headers.location, destPath).then(resolve).catch(reject);
                }
                if (response.statusCode !== 200) {
                    file.close();
                    fs.unlinkSync(destPath);
                    return reject(new Error(`Failed to download ${url}: HTTP ${response.statusCode}`));
                }
                response.pipe(file);
                file.on('finish', () => file.close(() => resolve(destPath)));
            })
            .on('error', (err) => {
                file.close();
                if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
                reject(err);
            });
    });
}

async function ensureClubImages() {
    if (!fs.existsSync(PUBLIC_CLUBS_DIR)) {
        fs.mkdirSync(PUBLIC_CLUBS_DIR, { recursive: true });
    }

    for (const club of CLUBS) {
        const filename = `${club.slug}.jpg`;
        const destPath = path.join(PUBLIC_CLUBS_DIR, filename);
        if (!fs.existsSync(destPath)) {
            console.log(`Downloading thumbnail: ${club.name}`);
            await downloadImage(club.imageUrl, destPath);
        } else {
            console.log(`Thumbnail exists: ${filename}`);
        }
        club.localImagePath = `/clubs/${filename}`;
    }
}

async function seedClubs() {
    try {
        console.log('Seeding campus clubs...');
        await ensureClubImages();

        for (const club of CLUBS) {
            const [existing] = await masterPool.query('SELECT id FROM clubs WHERE name = ?', [club.name]);

            if (existing.length > 0) {
                await masterPool.query(
                    'UPDATE clubs SET description = ?, image_url = ?, is_active = TRUE WHERE id = ?',
                    [club.description, club.localImagePath, existing[0].id]
                );
                console.log(`Updated: ${club.name}`);
            } else {
                await masterPool.query(
                    `INSERT INTO clubs (name, description, image_url, form_fields, members, activities, is_active, membership_fee, fee_type)
                     VALUES (?, ?, ?, ?, ?, ?, TRUE, 0, 'Yearly')`,
                    [
                        club.name,
                        club.description,
                        club.localImagePath,
                        JSON.stringify([]),
                        JSON.stringify([]),
                        JSON.stringify([]),
                    ]
                );
                console.log(`Created: ${club.name}`);
            }
        }

        const [all] = await masterPool.query('SELECT id, name, LEFT(description, 60) AS desc_preview, image_url FROM clubs ORDER BY id');
        console.log('\nClubs in database:');
        console.table(all);
        console.log('Club seeding completed.');
        process.exit(0);
    } catch (error) {
        console.error('Error seeding clubs:', error);
        process.exit(1);
    }
}

seedClubs();
