/**
 * Landing page images — locally generated assets in /public/landing/
 * Replace PNG files in frontend/public/landing/ to update visuals sitewide.
 */

const img = (name) => `/landing/${name}.png`;

/** Main section backgrounds */
export const SECTION_IMAGES = {
    hero: img('hero-campus'),
    statsBackground: img('students-group'),
    crtPlacements: img('placements-banner'),
    crtTraining: img('crt-training'),
    notifications: img('notifications'),
    security: img('security'),
    cta: img('students-group')
};

/** “What you can track” strip — 6 cards */
export const TRACKING_IMAGES = {
    attendance: img('attendance'),
    registration: img('registration'),
    fees: img('fees'),
    profile: img('profile'),
    timetable: img('timetable'),
    notices: img('announcements')
};

/** Category banners + feature card images */
export const FEATURE_IMAGES = {
    academic: {
        banner: img('attendance'),
        attendance: img('attendance'),
        timetable: img('timetable'),
        registration: img('registration')
    },
    campus: {
        banner: img('events'),
        announcements: img('announcements'),
        events: img('events'),
        clubs: img('clubs')
    },
    records: {
        banner: img('hero-campus'),
        profile: img('profile'),
        documents: img('documents'),
        profileRequests: img('profile-requests')
    },
    services: {
        banner: img('placements-banner'),
        digitalServices: img('digital-services'),
        fees: img('fees'),
        transport: img('transport'),
        internship: img('internship')
    },
    support: {
        banner: img('crt-training'),
        maintenance: img('maintenance'),
        feedback: img('feedback')
    }
};
