import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
    GraduationCap,
    ArrowRight,
    CheckCircle,
    CheckCircle2,
    Smartphone,
    ShieldCheck,
    Zap,
    LogIn,
    BookOpen,
    Calendar,
    ClipboardList,
    Award,
    Presentation,
    Target,
    Clock,
    FileText,
    Users,
    Megaphone,
    Briefcase,
    Ticket,
    Bus,
    Wallet,
    MessageSquare,
    MapPin,
    FolderOpen,
    User,
    BarChart3,
    Bell,
    LineChart,
    BadgeCheck,
    Building2,
    Sparkles
} from 'lucide-react';
import { SECTION_IMAGES, TRACKING_IMAGES, FEATURE_IMAGES } from '../config/landingImages';

const CRT_FEATURES = [
    'Campus Recruitment Training (CRT) sessions',
    'Mock interviews & aptitude preparation',
    'Placement drives & company notifications',
    'Track offers, training attendance & cell updates',
    '#ProudlyPlaced — celebrate every success story'
];

const TRACKING_HIGHLIGHTS = [
    { icon: BarChart3, label: 'Attendance', desc: 'Daily & semester %', image: TRACKING_IMAGES.attendance },
    { icon: FileText, label: 'Registration', desc: 'Semester enrollment', image: TRACKING_IMAGES.registration },
    { icon: Wallet, label: 'Fee Status', desc: 'Payments & dues', image: TRACKING_IMAGES.fees },
    { icon: BadgeCheck, label: 'Profile', desc: 'Verified records', image: TRACKING_IMAGES.profile },
    { icon: Clock, label: 'Timetable', desc: 'Class schedule', image: TRACKING_IMAGES.timetable },
    { icon: Megaphone, label: 'Notices', desc: 'Announcements & polls', image: TRACKING_IMAGES.notices }
];

const PORTAL_MODULES = [
    {
        category: 'Academic Tracking',
        tagline: 'Classes, attendance & semester progress',
        bannerImage: FEATURE_IMAGES.academic.banner,
        accent: 'from-sky-600/90 to-sky-900/90',
        chipClass: 'bg-sky-500/15 text-sky-800 border-sky-200',
        items: [
            { icon: CheckCircle2, title: 'Attendance Records', desc: 'Daily present/absent status, semester percentage, and holiday-aware calendar.', image: FEATURE_IMAGES.academic.attendance },
            { icon: Clock, title: 'Class Timetable', desc: 'Period-wise schedule with subjects, labs, and full weekly view.', image: FEATURE_IMAGES.academic.timetable },
            { icon: FileText, title: 'Semester Registration', desc: 'Enrollment, document upload, status tracking, and registration slip.', image: FEATURE_IMAGES.academic.registration }
        ]
    },
    {
        category: 'Campus & Community',
        tagline: 'Stay connected with college life',
        bannerImage: FEATURE_IMAGES.campus.banner,
        accent: 'from-violet-600/90 to-violet-900/90',
        chipClass: 'bg-violet-500/15 text-violet-800 border-violet-200',
        items: [
            { icon: Megaphone, title: 'Announcements & Polls', desc: 'Official notices, image announcements, and live student voting.', image: FEATURE_IMAGES.campus.announcements },
            { icon: Calendar, title: 'Event Calendar', desc: 'Workshops, celebrations, and campus events with full details.', image: FEATURE_IMAGES.campus.events },
            { icon: Users, title: 'Student Clubs', desc: 'Join clubs, track membership, activities, and dues.', image: FEATURE_IMAGES.campus.clubs }
        ]
    },
    {
        category: 'Your Student Records',
        tagline: 'Profile, documents & verified data',
        bannerImage: FEATURE_IMAGES.records.banner,
        accent: 'from-emerald-600/90 to-emerald-900/90',
        chipClass: 'bg-emerald-500/15 text-emerald-800 border-emerald-200',
        items: [
            { icon: User, title: 'Profile & Verification', desc: 'Verify your academic profile and photo synced with college records.', image: FEATURE_IMAGES.records.profile },
            { icon: FolderOpen, title: 'My Documents', desc: 'Certificates, ID proofs, and college-required documents in one vault.', image: FEATURE_IMAGES.records.documents },
            { icon: ClipboardList, title: 'Profile Change Requests', desc: 'Request detail updates and track admin approval in real time.', image: FEATURE_IMAGES.records.profileRequests }
        ]
    },
    {
        category: 'Services & Finance',
        tagline: 'Certificates, fees, transport & internship',
        bannerImage: FEATURE_IMAGES.services.banner,
        accent: 'from-cyan-600/90 to-cyan-900/90',
        chipClass: 'bg-cyan-500/15 text-cyan-800 border-cyan-200',
        items: [
            { icon: Briefcase, title: 'Digital Services', desc: 'Study conduct, custodian, TC certificates with live status tracking.', image: FEATURE_IMAGES.services.digitalServices },
            { icon: Wallet, title: 'Fee Management', desc: 'Fee status, payment history, and clearance linked to registration.', image: FEATURE_IMAGES.services.fees },
            { icon: Bus, title: 'Transport', desc: 'Bus routes, pickup points, and transport allocation.', image: FEATURE_IMAGES.services.transport },
            { icon: MapPin, title: 'Internship Tracking', desc: 'Assignment, company details, and progress when assigned.', image: FEATURE_IMAGES.services.internship }
        ]
    },
    {
        category: 'Support & Feedback',
        tagline: 'Help desk & college feedback',
        bannerImage: FEATURE_IMAGES.support.banner,
        accent: 'from-rose-600/90 to-rose-900/90',
        chipClass: 'bg-rose-500/15 text-rose-800 border-rose-200',
        items: [
            { icon: Ticket, title: 'Maintenance & Support', desc: 'Raise campus tickets and track resolution from the help desk.', image: FEATURE_IMAGES.support.maintenance },
            { icon: MessageSquare, title: 'Feedback Forms', desc: 'Submit course and faculty feedback through configured forms.', image: FEATURE_IMAGES.support.feedback }
        ]
    }
];

const fadeUp = {
    hidden: { opacity: 0, y: 28 },
    visible: (i = 0) => ({
        opacity: 1,
        y: 0,
        transition: { duration: 0.55, delay: i * 0.08, ease: 'easeOut' }
    })
};

const FeatureCard = ({ item, index }) => {
    const Icon = item.icon;
    return (
        <motion.article
            custom={index}
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-40px' }}
            className="group relative flex flex-col overflow-hidden rounded-2xl sm:rounded-3xl bg-white border border-border-light/80 shadow-lg shadow-primary/5 hover:shadow-2xl hover:shadow-primary/10 transition-all duration-500 hover:-translate-y-1"
        >
            <div className="relative aspect-[16/11] sm:aspect-[16/10] overflow-hidden">
                <img
                    src={item.image}
                    alt={item.title}
                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                    loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-primary/85 via-primary/25 to-transparent" />
                <div className="absolute top-4 left-4 w-11 h-11 rounded-xl bg-white/95 backdrop-blur-sm flex items-center justify-center shadow-lg border border-white/50">
                    <Icon size={22} className="text-primary" />
                </div>
                <h4 className="absolute bottom-4 left-4 right-4 text-lg sm:text-xl font-bold text-white leading-tight drop-shadow-md">
                    {item.title}
                </h4>
            </div>
            <div className="p-5 sm:p-6 flex-1 flex flex-col">
                <p className="text-text-secondary text-sm leading-relaxed flex-1">{item.desc}</p>
                <div className="mt-4 pt-4 border-t border-border-light/60 flex items-center gap-2 text-primary font-semibold text-sm group-hover:gap-3 transition-all">
                    <span>Included in portal</span>
                    <CheckCircle size={16} className="text-accent" />
                </div>
            </div>
        </motion.article>
    );
};

const GetStarted = () => {
    const navigate = useNavigate();
    const [isOnline, setIsOnline] = useState(navigator.onLine);

    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    const totalModules = PORTAL_MODULES.reduce((n, c) => n + c.items.length, 0);

    return (
        <div className="min-h-screen w-full overflow-x-hidden bg-secondary font-body selection:bg-accent/30">
            {!isOnline && (
                <div className="fixed bottom-4 left-4 z-[100] bg-red-500 text-white px-4 py-2 rounded-full text-xs font-bold shadow-lg flex items-center gap-2">
                    <div className="w-2 h-2 bg-white rounded-full animate-ping" />
                    Offline Mode
                </div>
            )}

            {/* Nav — full width */}
            <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-b border-border-light px-4 sm:px-8 lg:px-12 xl:px-16 py-4 flex justify-between items-center">
                <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/')}>
                    <div className="p-1 px-3 bg-primary/5 rounded-xl border border-primary/10 shadow-sm">
                        <img src="/logo.png" alt="Logo" className="h-10 w-auto object-contain" onError={(e) => { e.target.style.display = 'none'; }} />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-lg sm:text-xl font-bold text-primary tracking-tight">Pydah Group</span>
                        <span className="text-[9px] sm:text-[10px] font-bold text-accent uppercase tracking-[0.2em]">Student Portal</span>
                    </div>
                </div>
                <div className="flex items-center gap-2 sm:gap-4">
                    <button onClick={() => navigate('/login')} className="hidden sm:flex items-center gap-2 text-primary font-semibold hover:text-primary-light">
                        <LogIn size={18} /> Login
                    </button>
                    <button onClick={() => navigate('/login')} className="bg-primary text-white px-5 sm:px-7 py-2.5 rounded-xl font-semibold hover:bg-primary-dark shadow-lg active:scale-95">
                        Get Started
                    </button>
                </div>
            </nav>

            {/* Hero — mobile: text left + photo right; desktop: split columns */}
            <section className="relative w-full pt-[4.5rem] lg:flex lg:flex-row lg:items-stretch lg:min-h-[calc(100vh-4.5rem)] lg:max-h-[920px] bg-secondary overflow-hidden">
                <div className="relative z-10 w-full lg:w-[46%] xl:w-[44%] 2xl:w-[42%] flex flex-col justify-center px-4 sm:px-6 lg:px-10 xl:px-14 2xl:px-16 py-6 sm:py-8 lg:py-14 shrink-0">
                    {/* Full-width badge on mobile so label is not clipped beside photo */}
                    <motion.span
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4 }}
                        className="inline-flex items-center gap-1.5 sm:gap-2 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full bg-primary/5 border border-primary/10 text-primary text-[10px] sm:text-xs font-bold uppercase tracking-wide sm:tracking-[0.2em] mb-3 sm:mb-6 w-fit max-w-full lg:hidden"
                    >
                        <LineChart size={12} className="text-accent shrink-0" aria-hidden />
                        <span className="leading-snug">Unified Student Tracking</span>
                    </motion.span>

                    <div className="flex flex-row gap-3 sm:gap-5 items-start lg:block">
                        {/* Copy — always left */}
                        <motion.div
                            initial={{ opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5 }}
                            className="flex-1 min-w-0 lg:max-w-xl"
                        >
                            <span className="hidden lg:inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/5 border border-primary/10 text-primary text-xs font-bold uppercase tracking-[0.2em] mb-6">
                                <LineChart size={14} className="text-accent shrink-0" aria-hidden />
                                Unified Student Tracking
                            </span>
                            <h1 className="text-[1.35rem] leading-[1.15] sm:text-3xl md:text-4xl xl:text-5xl 2xl:text-6xl font-bold text-primary mb-3 sm:mb-6">
                                Track <span className="text-accent">Everything</span> About Your Student Life
                            </h1>
                            <p className="text-sm sm:text-base lg:text-lg text-text-secondary mb-4 sm:mb-8 leading-relaxed hidden sm:block">
                                One portal for attendance, fees, registration, documents, timetable, clubs, events, certificates, transport, internship, and support — linked to your admission number.
                            </p>
                            <p className="text-xs text-text-secondary mb-4 leading-relaxed sm:hidden">
                                Attendance, fees, registration, documents &amp; more — linked to your admission number.
                            </p>

                            <div className="flex flex-col gap-2.5 sm:flex-row sm:gap-4">
                                <button onClick={() => navigate('/login')} className="group bg-primary text-white px-5 sm:px-8 py-3 sm:py-4 rounded-xl sm:rounded-2xl font-bold text-sm sm:text-lg hover:bg-primary-dark shadow-xl flex items-center justify-center gap-2 active:scale-95">
                                    Launch Portal <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                                </button>
                                <button onClick={() => document.getElementById('portal-features')?.scrollIntoView({ behavior: 'smooth' })} className="px-5 sm:px-8 py-3 sm:py-4 rounded-xl sm:rounded-2xl font-bold text-sm sm:text-lg text-primary border-2 border-primary/15 hover:bg-primary/5 bg-white/80">
                                    Explore Features
                                </button>
                            </div>
                        </motion.div>

                        {/* Mobile / tablet: campus photo — right of text */}
                        <div className="w-[38%] max-w-[148px] sm:w-[42%] sm:max-w-[200px] shrink-0 lg:hidden">
                            <div className="relative aspect-[3/4] rounded-xl sm:rounded-2xl overflow-hidden shadow-lg border-2 border-white ring-1 ring-primary/10">
                                <img
                                    src={SECTION_IMAGES.hero}
                                    alt="Pydah Group campus"
                                    className="absolute inset-0 w-full h-full object-cover object-[center_25%]"
                                    fetchPriority="high"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-primary/40 via-transparent to-transparent pointer-events-none" />
                            </div>
                            <p className="mt-2 text-[9px] font-bold text-accent uppercase tracking-wider text-center leading-tight">
                                Education &amp; Beyond
                            </p>
                        </div>
                    </div>

                    {/* Mobile stats — below row, not on photo */}
                    <div className="mt-4 grid grid-cols-3 gap-2 lg:hidden">
                        <div className="bg-white border border-border-light rounded-xl px-2.5 py-2 text-center shadow-sm">
                            <p className="text-[8px] font-bold text-text-secondary uppercase tracking-wider">Attendance</p>
                            <p className="text-base font-bold text-primary leading-tight">87.4%</p>
                        </div>
                        <div className="bg-white border border-border-light rounded-xl px-2.5 py-2 flex flex-col items-center justify-center shadow-sm">
                            <CheckCircle className="text-success mb-0.5" size={16} />
                            <p className="text-[8px] font-bold text-primary leading-tight">Verified</p>
                        </div>
                        <div className="bg-accent/90 text-primary rounded-xl px-2.5 py-2 flex items-center justify-center text-center font-bold text-[10px] sm:text-xs shadow-sm">
                            {totalModules}+ Modules
                        </div>
                    </div>
                </div>

                {/* Desktop: large campus photo + overlays */}
                <div className="relative hidden lg:flex lg:flex-1 items-stretch min-h-0 p-8 lg:pl-2 xl:pl-4">
                    <div className="relative w-full flex-1 rounded-3xl overflow-hidden shadow-2xl border border-white/60 ring-1 ring-primary/10 bg-primary/5">
                        <img
                            src={SECTION_IMAGES.hero}
                            alt="Pydah Group of Institutions — Education and Beyond"
                            className="absolute inset-0 w-full h-full object-cover object-[center_30%]"
                            fetchPriority="high"
                        />
                        <div className="absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-secondary/90 to-transparent pointer-events-none" />

                        <div className="absolute top-5 left-5 z-10 max-w-[240px]">
                            <div className="bg-white/95 backdrop-blur-md rounded-2xl px-4 py-3 shadow-xl border border-white/50">
                                <div className="flex items-center gap-2 mb-1.5">
                                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                        <Building2 size={16} className="text-primary" />
                                    </div>
                                    <p className="text-[10px] font-bold text-accent uppercase tracking-widest leading-tight">Pydah Group</p>
                                </div>
                                <p className="text-base font-bold text-primary italic leading-snug">Education &amp; Beyond</p>
                                <p className="text-[10px] text-text-secondary mt-1 flex items-center gap-1">
                                    <Sparkles size={10} className="text-accent shrink-0" />
                                    NAAC accredited institution
                                </p>
                            </div>
                        </div>

                        <div className="absolute top-5 right-5 z-10 bg-white/95 backdrop-blur-md rounded-2xl px-4 py-3 shadow-xl border border-white/50 min-w-[120px]">
                            <p className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">Attendance</p>
                            <p className="text-3xl font-bold text-primary leading-none mt-0.5">87.4%</p>
                            <p className="text-[10px] text-accent font-semibold mt-1">Semester average</p>
                        </div>

                        <div className="absolute bottom-5 left-5 right-5 z-10 flex gap-3 justify-between items-end">
                            <div className="bg-white/95 backdrop-blur-md rounded-2xl px-4 py-3 shadow-xl border border-white/50 flex items-center gap-3">
                                <div className="w-10 h-10 bg-success/20 rounded-full flex items-center justify-center shrink-0">
                                    <CheckCircle className="text-success" size={20} />
                                </div>
                                <div>
                                    <p className="text-xs font-bold text-primary">Profile Verified</p>
                                    <p className="text-[10px] text-text-secondary">College database sync</p>
                                </div>
                            </div>
                            <div className="bg-accent text-primary px-4 py-3 rounded-2xl font-bold text-sm shadow-xl border border-accent-dark/20">
                                {totalModules}+ Portal Modules
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Tracking strip — full width photo cards */}
            <section className="w-full bg-white border-y border-border-light py-6 sm:py-8">
                <div className="w-full px-3 sm:px-6 lg:px-10 xl:px-14">
                    <p className="text-center text-xs font-bold text-accent uppercase tracking-[0.25em] mb-5">What you can track instantly</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
                        {TRACKING_HIGHLIGHTS.map(({ icon: Icon, label, desc, image }, i) => (
                            <motion.div
                                key={label}
                                custom={i}
                                variants={fadeUp}
                                initial="hidden"
                                whileInView="visible"
                                viewport={{ once: true }}
                                className="group relative aspect-[4/5] sm:aspect-[3/4] rounded-2xl overflow-hidden shadow-md hover:shadow-xl transition-shadow cursor-default"
                            >
                                <img src={image} alt={label} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
                                <div className="absolute inset-0 bg-gradient-to-t from-primary/90 via-primary/40 to-primary/10" />
                                <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-4 text-white">
                                    <Icon size={18} className="text-accent mb-2" />
                                    <p className="font-bold text-sm leading-tight">{label}</p>
                                    <p className="text-[10px] text-white/75 mt-0.5">{desc}</p>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Stats — full width with campus life background */}
            <section className="relative w-full py-16 sm:py-20 overflow-hidden">
                <img
                    src={SECTION_IMAGES.statsBackground}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover object-center"
                    loading="lazy"
                    aria-hidden
                />
                <div className="absolute inset-0 bg-primary/92" />
                <div className="relative z-10 w-full px-4 sm:px-8 lg:px-12 xl:px-16 grid grid-cols-2 lg:grid-cols-4 gap-8 text-center">
                    {[
                        { label: 'Portal Modules', val: `${totalModules}+` },
                        { label: 'Active Students', val: '5,000+' },
                        { label: 'Service Requests', val: '15k+' },
                        { label: 'Uptime', val: '99.9%' }
                    ].map((stat, i) => (
                        <motion.div key={stat.label} custom={i} variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}>
                            <h3 className="text-4xl sm:text-5xl font-bold text-accent mb-2">{stat.val}</h3>
                            <p className="text-accent-light text-xs sm:text-sm uppercase tracking-widest font-semibold opacity-85">{stat.label}</p>
                        </motion.div>
                    ))}
                </div>
            </section>

            {/* CRT & Placements Training Portal */}
            <section id="crt-training" className="w-full scroll-mt-20 bg-white">
                <div className="relative w-full aspect-[1905/736] max-h-[min(58vh,736px)] min-h-[220px] sm:min-h-[300px]">
                    <img
                        src={SECTION_IMAGES.crtPlacements}
                        alt="Pydah Placements and Training Cell — Proudly Placed"
                        className="absolute inset-0 w-full h-full object-cover object-center"
                        loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-b from-primary/50 via-primary/20 to-primary/85" />
                    <div className="absolute inset-0 flex flex-col items-center justify-end sm:justify-center text-center px-4 sm:px-8 pb-8 sm:pb-0">
                        <motion.p
                            initial={{ opacity: 0, y: 12 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            className="text-white/95 text-sm sm:text-lg md:text-xl font-medium italic max-w-3xl mb-3 sm:mb-4 drop-shadow-md"
                        >
                            Where your journey towards employability begins!!
                        </motion.p>
                        <motion.h2
                            initial={{ opacity: 0, y: 16 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            className="text-2xl sm:text-4xl md:text-5xl font-bold text-white tracking-tight drop-shadow-lg mb-2"
                        >
                            Placements &amp; Training Cell
                        </motion.h2>
                        <motion.span
                            initial={{ opacity: 0 }}
                            whileInView={{ opacity: 1 }}
                            viewport={{ once: true }}
                            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/15 backdrop-blur-md border border-white/25 text-white text-xs sm:text-sm font-bold uppercase tracking-widest"
                        >
                            <Award size={16} className="text-accent" />
                            #ProudlyPlaced · Pydah Group
                        </motion.span>
                    </div>
                </div>

                <div className="w-full px-4 sm:px-8 lg:px-12 xl:px-16 2xl:px-20 py-14 sm:py-20 bg-secondary">
                    <div className="w-full grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
                        <motion.div
                            initial={{ opacity: 0, x: -24 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                            className="order-2 lg:order-1"
                        >
                            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/5 border border-primary/10 text-primary text-xs font-bold uppercase tracking-[0.2em] mb-5">
                                <Presentation size={14} className="text-accent" />
                                CRT Training Portal
                            </span>
                            <h3 className="text-3xl sm:text-4xl font-bold text-primary mb-4 leading-tight">
                                Campus Recruitment Training, <span className="text-accent">Built for You</span>
                            </h3>
                            <p className="text-text-secondary text-base sm:text-lg leading-relaxed mb-6">
                                Interactive CRT sessions, placement drives, and employability tracking — from classroom training to your first offer letter, managed through the student portal ecosystem.
                            </p>
                            <ul className="space-y-3 mb-8">
                                {CRT_FEATURES.map((text) => (
                                    <li key={text} className="flex items-start gap-3 text-primary font-medium text-sm sm:text-base">
                                        <div className="w-6 h-6 bg-accent/25 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                                            <Target size={14} className="text-accent-dark" />
                                        </div>
                                        {text}
                                    </li>
                                ))}
                            </ul>
                            <button
                                onClick={() => navigate('/login')}
                                className="inline-flex items-center gap-2 bg-primary text-white px-8 py-4 rounded-2xl font-bold text-base hover:bg-primary-dark shadow-xl active:scale-95"
                            >
                                Access Student Portal
                                <ArrowRight size={18} />
                            </button>
                        </motion.div>

                        <motion.div
                            initial={{ opacity: 0, x: 24 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                            className="order-1 lg:order-2 relative rounded-2xl sm:rounded-3xl overflow-hidden shadow-2xl border-4 border-white aspect-[954/660] max-h-[520px] w-full"
                        >
                            <img
                                src={SECTION_IMAGES.crtTraining}
                                alt="CRT training session at Pydah Group"
                                className="absolute inset-0 w-full h-full object-cover object-center"
                                loading="lazy"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-primary/40 via-transparent to-transparent" />
                            <div className="absolute bottom-4 left-4 right-4 sm:bottom-6 sm:left-6 sm:right-6">
                                <div className="bg-white/95 backdrop-blur-md rounded-xl sm:rounded-2xl p-4 border border-white/50 shadow-lg">
                                    <p className="text-[10px] font-bold text-accent uppercase tracking-widest mb-1">Live CRT Session</p>
                                    <p className="text-sm sm:text-base font-bold text-primary">Interactive training &amp; placement prep</p>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                </div>
            </section>

            {/* Features — full width category bands */}
            <section id="portal-features" className="w-full scroll-mt-20">
                <div className="w-full px-4 sm:px-8 lg:px-12 xl:px-16 2xl:px-20 py-16 sm:py-24 text-center">
                    <p className="text-accent font-bold text-sm uppercase tracking-[0.25em] mb-3">What the portal can do</p>
                    <h2 className="text-3xl sm:text-4xl md:text-5xl xl:text-6xl font-bold text-primary mb-5">
                        Every Feature, <span className="text-accent">One Dashboard</span>
                    </h2>
                    <p className="text-text-secondary max-w-3xl mx-auto text-base sm:text-lg">
                        Premium modules with real photos — attendance to certificates, all tracked from your admission record.
                    </p>
                </div>

                {PORTAL_MODULES.map((group, gi) => (
                    <div
                        key={group.category}
                        className={`w-full py-14 sm:py-20 ${gi % 2 === 0 ? 'bg-secondary' : 'bg-white'}`}
                    >
                        <div className="w-full px-4 sm:px-8 lg:px-12 xl:px-16 2xl:px-20">
                            {/* Category banner — full width */}
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                className="relative w-full h-44 sm:h-56 md:h-64 lg:h-72 rounded-2xl sm:rounded-3xl overflow-hidden mb-10 sm:mb-12 shadow-2xl"
                            >
                                <img src={group.bannerImage} alt={group.category} className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
                                <div className={`absolute inset-0 bg-gradient-to-r ${group.accent}`} />
                                <div className="absolute inset-0 flex flex-col justify-end p-6 sm:p-10 md:p-12">
                                    <span className={`inline-flex self-start items-center gap-2 px-3 py-1 rounded-lg border text-xs font-bold uppercase tracking-widest mb-3 ${group.chipClass} bg-white/90`}>
                                        <BookOpen size={14} /> Module group
                                    </span>
                                    <h3 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-1">{group.category}</h3>
                                    <p className="text-white/85 text-sm sm:text-base max-w-xl">{group.tagline}</p>
                                </div>
                            </motion.div>

                            <div className={`grid gap-5 sm:gap-6 lg:gap-8 ${
                                group.items.length === 4
                                    ? 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4'
                                    : group.items.length === 2
                                        ? 'grid-cols-1 md:grid-cols-2 max-w-5xl'
                                        : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3'
                            }`}>
                                {group.items.map((item, ii) => (
                                    <FeatureCard key={item.title} item={item} index={ii} />
                                ))}
                            </div>
                        </div>
                    </div>
                ))}

                {/* Notifications — full width image panel */}
                <div className="w-full px-4 sm:px-8 lg:px-12 xl:px-16 2xl:px-20 py-16 sm:py-20">
                    <motion.div
                        initial={{ opacity: 0, y: 24 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="relative w-full min-h-[320px] sm:min-h-[380px] rounded-3xl overflow-hidden shadow-2xl"
                    >
                        <img src={SECTION_IMAGES.notifications} alt="Push notifications on student devices" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
                        <div className="absolute inset-0 bg-gradient-to-r from-primary/95 via-primary/80 to-primary/50" />
                        <div className="relative z-10 p-8 sm:p-12 lg:p-16 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-10">
                            <div className="max-w-xl">
                                <div className="flex items-center gap-2 mb-4">
                                    <Bell className="text-accent" size={24} />
                                    <span className="text-accent font-bold text-sm uppercase tracking-widest">Real-time updates</span>
                                </div>
                                <h3 className="text-2xl sm:text-4xl font-bold text-white mb-4">Push notifications & live sync</h3>
                                <p className="text-white/80 text-sm sm:text-base leading-relaxed">
                                    Alerts for announcements, registration deadlines, fee reminders, certificate status, and attendance — synced instantly to your record.
                                </p>
                            </div>
                            <ul className="grid sm:grid-cols-2 gap-3 lg:max-w-md shrink-0">
                                {['Daily attendance', 'Registration alerts', 'Certificate ready', 'Announcement popups', 'Poll reminders', 'Mobile PWA'].map((text) => (
                                    <li key={text} className="flex items-center gap-2 text-white text-sm font-medium bg-white/10 backdrop-blur-sm px-4 py-2.5 rounded-xl border border-white/15">
                                        <CheckCircle size={16} className="text-accent shrink-0" /> {text}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* Security — full width split with image */}
            <section className="w-full bg-white py-16 sm:py-24 overflow-hidden">
                <div className="w-full flex flex-col lg:flex-row min-h-[480px]">
                    <div className="w-full lg:w-1/2 px-4 sm:px-8 lg:px-12 xl:px-16 2xl:px-20 py-12 lg:py-16 flex flex-col justify-center">
                        <div className="w-14 h-14 bg-primary/5 rounded-2xl flex items-center justify-center mb-6">
                            <ShieldCheck className="text-primary" size={30} />
                        </div>
                        <h2 className="text-3xl sm:text-4xl font-bold text-primary mb-4">Secure, Private & Always Available</h2>
                        <p className="text-text-secondary text-base sm:text-lg mb-8 leading-relaxed">
                            Admission-linked accounts with encrypted documents and role-based access — students, parents, and faculty each see only what they should.
                        </p>
                        <ul className="space-y-4">
                            {[
                                'Profile verification against college database',
                                'Encrypted document uploads & downloads',
                                'Role-based access control',
                                'Phone, tablet & desktop (PWA)'
                            ].map((text) => (
                                <li key={text} className="flex items-center gap-3 text-primary font-medium">
                                    <div className="w-6 h-6 bg-accent/25 rounded-full flex items-center justify-center shrink-0">
                                        <CheckCircle className="text-accent-dark" size={14} />
                                    </div>
                                    {text}
                                </li>
                            ))}
                        </ul>
                    </div>
                    <div className="relative w-full lg:w-1/2 min-h-[300px] lg:min-h-auto">
                        <img src={SECTION_IMAGES.security} alt="Secure Pydah campus" className="absolute inset-0 w-full h-full object-cover object-center" loading="lazy" />
                        <div className="absolute inset-0 bg-gradient-to-t lg:bg-gradient-to-l from-white via-transparent to-transparent lg:from-white" />
                        <div className="absolute bottom-6 left-6 right-6 lg:bottom-12 lg:left-12 grid grid-cols-2 gap-3 max-w-md">
                            {[
                                { icon: Zap, label: 'Fast' },
                                { icon: Smartphone, label: 'Mobile' },
                                { icon: GraduationCap, label: 'Academic' },
                                { icon: Award, label: 'Verified' }
                            ].map(({ icon: Icon, label }) => (
                                <div key={label} className="bg-white/95 backdrop-blur-md p-4 rounded-2xl shadow-lg border border-white/50 flex items-center gap-3">
                                    <Icon size={20} className="text-primary" />
                                    <span className="font-bold text-primary text-sm">{label}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {/* CTA — full width */}
            <section className="w-full px-4 sm:px-8 lg:px-12 xl:px-16 2xl:px-20 py-16 sm:py-24">
                <div className="relative w-full rounded-3xl sm:rounded-[2.5rem] overflow-hidden shadow-2xl min-h-[360px] flex items-center justify-center">
                    <img src={SECTION_IMAGES.cta} alt="Pydah students — join the portal" className="absolute inset-0 w-full h-full object-cover object-center" loading="lazy" />
                    <div className="absolute inset-0 bg-primary/88" />
                    <div className="relative z-10 text-center px-6 py-14 sm:py-20 max-w-4xl mx-auto">
                        <h2 className="text-3xl sm:text-5xl font-bold text-white mb-6">Ready to Track Your Campus Life?</h2>
                        <p className="text-accent-light text-base sm:text-xl mb-10 opacity-95 leading-relaxed">
                            Log in with your admission number — {totalModules}+ modules waiting for you.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-4 justify-center">
                            <button onClick={() => navigate('/login')} className="bg-accent text-primary px-10 py-4 rounded-2xl font-bold text-lg hover:bg-accent-light shadow-xl active:scale-95">
                                Login as Student
                            </button>
                            <button onClick={() => navigate('/login')} className="bg-white/15 backdrop-blur text-white border border-white/30 px-10 py-4 rounded-2xl font-bold text-lg hover:bg-white/25 active:scale-95">
                                Faculty Access
                            </button>
                        </div>
                    </div>
                </div>
            </section>

            <footer className="w-full bg-white border-t border-border-light py-10 px-4 sm:px-8 lg:px-12 xl:px-16">
                <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                    <div className="flex items-center gap-3">
                        <img src="/logo.png" alt="Logo" className="h-8 w-auto" onError={(e) => { e.target.style.display = 'none'; }} />
                        <span className="text-lg font-bold text-primary">Student Portal</span>
                    </div>
                    <p className="text-text-secondary text-sm">© {new Date().getFullYear()} Pydah Group of Institutions.</p>
                    <div className="flex gap-6 text-sm text-text-secondary">
                        <a href="#" className="hover:text-primary">Privacy</a>
                        <a href="#" className="hover:text-primary">Terms</a>
                        <a href="#" className="hover:text-primary">Contact</a>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default GetStarted;
