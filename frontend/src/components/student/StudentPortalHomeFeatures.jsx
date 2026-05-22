import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
    BarChart3,
    Calendar,
    CheckCircle2,
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
    ClipboardList,
    Sparkles,
    ArrowRight,
    ShieldCheck,
    Bell,
    GraduationCap,
    LineChart,
    BadgeCheck
} from 'lucide-react';

const FEATURE_CATEGORIES = [
    {
        id: 'academic',
        title: 'Academic Tracking',
        subtitle: 'Monitor classes, attendance, and semester progress in real time',
        accent: 'sky',
        features: [
            {
                key: 'attendance',
                path: '/student/attendance',
                icon: CheckCircle2,
                title: 'Attendance Records',
                description: 'Daily status, semester percentage, present/absent counts, and holiday calendar.',
                highlights: ['Today\'s status', 'Semester %', 'History view']
            },
            {
                key: 'timetable',
                path: '/student/timetable',
                icon: Clock,
                title: 'Class Timetable',
                description: 'Weekly schedule with subjects, labs, and period-wise timings for your branch.',
                highlights: ['Daily timeline', 'Period slots', 'Full week view']
            },
            {
                key: 'semester-registration',
                path: '/student/semester-registration',
                icon: FileText,
                title: 'Semester Registration',
                description: 'Complete enrollment, upload documents, and download your registration slip.',
                highlights: ['Status tracking', 'Document upload', 'Registration slip']
            }
        ]
    },
    {
        id: 'campus',
        title: 'Campus & Community',
        subtitle: 'Stay connected with announcements, events, and student clubs',
        accent: 'violet',
        features: [
            {
                key: 'announcements',
                path: '/student/announcements',
                icon: Megaphone,
                title: 'Announcements & Polls',
                description: 'Official college notices, image announcements, and live student polls.',
                highlights: ['College notices', 'Active polls', 'Vote & respond']
            },
            {
                key: 'events',
                path: '/student/events',
                icon: Calendar,
                title: 'Event Calendar',
                description: 'Upcoming campus events, workshops, and celebrations with full details.',
                highlights: ['Upcoming events', 'Date & time', 'Event types']
            },
            {
                key: 'clubs',
                path: '/student/clubs',
                icon: Users,
                title: 'Student Clubs',
                description: 'Join clubs, track membership status, activities, and membership dues.',
                highlights: ['Join & explore', 'Activity feed', 'Payment status']
            }
        ]
    },
    {
        id: 'records',
        title: 'Your Student Profile',
        subtitle: 'Everything about you — verified, organized, and always up to date',
        accent: 'emerald',
        alwaysShow: true,
        features: [
            {
                key: 'profile',
                path: '/student/profile',
                icon: User,
                title: 'Profile & Verification',
                description: 'View and verify your academic profile, photo, and personal records.',
                highlights: ['Profile verify', 'Photo & details', 'Data sync']
            },
            {
                key: 'my-documents',
                path: '/student/my-documents',
                icon: FolderOpen,
                title: 'My Documents',
                description: 'Access uploaded certificates, ID proofs, and college-required documents.',
                highlights: ['Document vault', 'Uploads', 'Downloads']
            },
            {
                key: 'profile-requests',
                path: '/student/profile-requests',
                icon: ClipboardList,
                title: 'Profile Change Requests',
                description: 'Request updates to your details and track admin approval status.',
                highlights: ['Change requests', 'Approval status', 'History']
            }
        ]
    },
    {
        id: 'services',
        title: 'Services & Finance',
        subtitle: 'Certificates, fees, transport, and internship — all in one place',
        accent: 'cyan',
        features: [
            {
                key: 'services',
                path: '/student/services',
                icon: Briefcase,
                title: 'Digital Services',
                description: 'Apply for study conduct, custodian, TC certificates and track request status.',
                highlights: ['Certificate requests', 'Status tracking', 'Ready to collect']
            },
            {
                key: 'fees',
                path: '/student/fees',
                icon: Wallet,
                title: 'Fee Management',
                description: 'View fee status, payment history, and financial clearance for registration.',
                highlights: ['Fee status', 'Payment tracking', 'No-due status']
            },
            {
                key: 'transport',
                path: '/student/transport',
                icon: Bus,
                title: 'Transport',
                description: 'Bus routes, pickup points, and transport allocation for your commute.',
                highlights: ['Route info', 'Pickup points', 'Allocation']
            },
            {
                key: 'internship',
                path: '/student/internship',
                icon: MapPin,
                title: 'Internship Tracking',
                description: 'View internship assignment, company details, and progress updates.',
                highlights: ['Assignment', 'Company info', 'Progress']
            }
        ]
    },
    {
        id: 'support',
        title: 'Support & Feedback',
        subtitle: 'Raise issues, share feedback, and get help when you need it',
        accent: 'rose',
        features: [
            {
                key: 'my-tickets',
                path: '/student/my-tickets',
                icon: Ticket,
                title: 'Maintenance & Support',
                description: 'Raise maintenance tickets and track resolution from the help desk.',
                highlights: ['Raise tickets', 'Track status', 'Campus support'],
                external: true
            },
            {
                key: 'feedback',
                path: '/student/feedback',
                icon: MessageSquare,
                title: 'Feedback Forms',
                description: 'Submit course and faculty feedback through college-configured forms.',
                highlights: ['Course feedback', 'Faculty forms', 'Submissions']
            }
        ]
    }
];

const TRACKING_PILLS = [
    { icon: BarChart3, label: 'Attendance', key: 'attendance' },
    { icon: GraduationCap, label: 'Registration', key: 'semester-registration' },
    { icon: Wallet, label: 'Fees', key: 'fees' },
    { icon: User, label: 'Profile', key: 'profile', always: true },
    { icon: Megaphone, label: 'Notices', key: 'announcements' },
    { icon: Briefcase, label: 'Services', key: 'services' }
];

const accentStyles = {
    sky: {
        section: 'from-sky-500/10 to-sky-600/5 border-sky-200',
        icon: 'bg-sky-500/10 text-sky-700 border-sky-200',
        badge: 'bg-sky-500/10 text-sky-700'
    },
    violet: {
        section: 'from-violet-500/10 to-violet-600/5 border-violet-200',
        icon: 'bg-violet-500/10 text-violet-700 border-violet-200',
        badge: 'bg-violet-500/10 text-violet-700'
    },
    emerald: {
        section: 'from-emerald-500/10 to-emerald-600/5 border-emerald-200',
        icon: 'bg-emerald-500/10 text-emerald-700 border-emerald-200',
        badge: 'bg-emerald-500/10 text-emerald-700'
    },
    cyan: {
        section: 'from-cyan-500/10 to-cyan-600/5 border-cyan-200',
        icon: 'bg-cyan-500/10 text-cyan-700 border-cyan-200',
        badge: 'bg-cyan-500/10 text-cyan-700'
    },
    rose: {
        section: 'from-rose-500/10 to-rose-600/5 border-rose-200',
        icon: 'bg-rose-500/10 text-rose-700 border-rose-200',
        badge: 'bg-rose-500/10 text-rose-700'
    }
};

const FeatureCard = ({ feature, accent, ticketAppUrl }) => {
    const Icon = feature.icon;
    const styles = accentStyles[accent] || accentStyles.sky;

    const content = (
        <div className="group h-full flex flex-col p-4 sm:p-5 rounded-xl lg:rounded-2xl bg-white border border-slate-100 hover:border-sky-200 hover:shadow-lg hover:shadow-sky-500/10 transition-all duration-300 hover:-translate-y-0.5">
            <div className="flex items-start gap-3 mb-3">
                <div className={`p-2.5 rounded-xl border shrink-0 ${styles.icon}`}>
                    <Icon size={20} />
                </div>
                <div className="min-w-0 flex-1">
                    <h4 className="text-sm sm:text-[15px] font-black text-slate-800 tracking-tight group-hover:text-sky-700 transition-colors">
                        {feature.title}
                    </h4>
                    <p className="text-[11px] sm:text-xs text-slate-500 mt-1 leading-relaxed line-clamp-2">
                        {feature.description}
                    </p>
                </div>
                <ArrowRight size={16} className="text-slate-300 group-hover:text-sky-600 group-hover:translate-x-0.5 transition-all shrink-0 mt-1" />
            </div>
            {feature.highlights?.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-auto pt-3 border-t border-slate-50">
                    {feature.highlights.map((tag) => (
                        <span
                            key={tag}
                            className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg ${styles.badge}`}
                        >
                            {tag}
                        </span>
                    ))}
                </div>
            )}
        </div>
    );

    if (feature.external && ticketAppUrl) {
        return (
            <a href={ticketAppUrl} className="block h-full">
                {content}
            </a>
        );
    }

    return (
        <Link to={feature.path} className="block h-full">
            {content}
        </Link>
    );
};

const StudentPortalHomeFeatures = ({
    isEnabled,
    ticketAppUrl,
    snapshot = {}
}) => {
    const visibleCategories = useMemo(() => {
        return FEATURE_CATEGORIES.map((category) => {
            const features = category.features.filter((f) => {
                if (category.alwaysShow) return true;
                return isEnabled(f.key);
            });
            return features.length > 0 ? { ...category, features } : null;
        }).filter(Boolean);
    }, [isEnabled]);

    const enabledFeatureCount = useMemo(() => {
        return visibleCategories.reduce((sum, cat) => sum + cat.features.length, 0);
    }, [visibleCategories]);

    const visiblePills = TRACKING_PILLS.filter(
        (p) => p.always || isEnabled(p.key)
    );

    if (enabledFeatureCount === 0) return null;

    return (
        <section className="relative overflow-hidden rounded-2xl lg:rounded-2xl border border-sky-100 bg-white shadow-md lg:shadow-lg shadow-sky-500/10">
            <div className="absolute top-0 right-0 w-72 h-72 bg-sky-400/10 rounded-full -mr-36 -mt-36 blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-indigo-400/10 rounded-full -ml-24 -mb-24 blur-3xl pointer-events-none" />

            <div className="relative z-10 p-4 sm:p-5 lg:p-6 border-b border-sky-50">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    <div className="flex items-start gap-3 sm:gap-4">
                        <div className="p-2.5 sm:p-3 rounded-xl lg:rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-lg shadow-sky-500/25 shrink-0">
                            <LineChart size={22} className="sm:w-6 sm:h-6" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-sky-600 uppercase tracking-[0.2em] mb-1">
                                Student Portal Hub
                            </p>
                            <h2 className="text-lg sm:text-xl lg:text-2xl font-black text-slate-800 tracking-tight leading-tight">
                                Track Everything About Your Student Life
                            </h2>
                            <p className="text-xs sm:text-sm text-slate-500 mt-1.5 max-w-2xl leading-relaxed">
                                One unified portal for attendance, academics, fees, documents, clubs, events, services, and support — all linked to your admission record.
                            </p>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 lg:justify-end shrink-0">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 text-[10px] font-black uppercase tracking-widest">
                            <ShieldCheck size={12} />
                            {enabledFeatureCount} modules active
                        </span>
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-sky-50 text-sky-700 border border-sky-100 text-[10px] font-black uppercase tracking-widest">
                            <Sparkles size={12} />
                            Real-time sync
                        </span>
                    </div>
                </div>

                {(snapshot.attendancePct != null || snapshot.registrationLabel || snapshot.feeStatusLabel || snapshot.isProfileVerified != null) && (
                    <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                        {snapshot.attendancePct != null && isEnabled('attendance') && (
                            <Link
                                to="/student/attendance"
                                className="p-3 rounded-xl bg-sky-50/80 border border-sky-100 hover:border-sky-300 transition-colors group"
                            >
                                <p className="text-[9px] font-black text-sky-600 uppercase tracking-widest mb-1">Attendance</p>
                                <p className="text-lg font-black text-slate-800 group-hover:text-sky-700">{snapshot.attendancePct}%</p>
                                <p className="text-[9px] text-slate-400 font-bold mt-0.5">Semester average</p>
                            </Link>
                        )}
                        {snapshot.registrationLabel && isEnabled('semester-registration') && (
                            <Link
                                to="/student/semester-registration"
                                className="p-3 rounded-xl bg-violet-50/80 border border-violet-100 hover:border-violet-300 transition-colors group"
                            >
                                <p className="text-[9px] font-black text-violet-600 uppercase tracking-widest mb-1">Registration</p>
                                <p className="text-sm font-black text-slate-800 group-hover:text-violet-700 truncate">{snapshot.registrationLabel}</p>
                            </Link>
                        )}
                        {snapshot.feeStatusLabel && isEnabled('fees') && (
                            <Link
                                to="/student/fees"
                                className="p-3 rounded-xl bg-cyan-50/80 border border-cyan-100 hover:border-cyan-300 transition-colors group"
                            >
                                <p className="text-[9px] font-black text-cyan-600 uppercase tracking-widest mb-1">Fees</p>
                                <p className="text-sm font-black text-slate-800 group-hover:text-cyan-700 truncate">{snapshot.feeStatusLabel}</p>
                            </Link>
                        )}
                        {snapshot.isProfileVerified != null && (
                            <Link
                                to="/student/profile"
                                className="p-3 rounded-xl bg-emerald-50/80 border border-emerald-100 hover:border-emerald-300 transition-colors group"
                            >
                                <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest mb-1">Profile</p>
                                <p className="text-sm font-black text-slate-800 group-hover:text-emerald-700 flex items-center gap-1">
                                    {snapshot.isProfileVerified ? (
                                        <>
                                            <BadgeCheck size={14} className="text-emerald-500" />
                                            Verified
                                        </>
                                    ) : (
                                        'Verify now'
                                    )}
                                </p>
                            </Link>
                        )}
                    </div>
                )}

                {visiblePills.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                        {visiblePills.map(({ icon: PillIcon, label, key, always }) => {
                            const path = key === 'profile'
                                ? '/student/profile'
                                : `/student/${key}`;
                            if (!always && !isEnabled(key)) return null;
                            return (
                                <Link
                                    key={key}
                                    to={path}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-100 text-[10px] font-bold text-slate-600 hover:bg-sky-50 hover:text-sky-700 hover:border-sky-200 transition-colors"
                                >
                                    <PillIcon size={12} />
                                    {label}
                                </Link>
                            );
                        })}
                    </div>
                )}
            </div>

            <div className="relative z-10 p-4 sm:p-5 lg:p-6 space-y-6 lg:space-y-8">
                {visibleCategories.map((category) => {
                    const styles = accentStyles[category.accent] || accentStyles.sky;
                    return (
                        <div key={category.id}>
                            <div className={`rounded-xl lg:rounded-2xl p-3 sm:p-4 mb-3 sm:mb-4 bg-gradient-to-r border ${styles.section}`}>
                                <h3 className="text-sm sm:text-base font-black text-slate-800 tracking-tight">
                                    {category.title}
                                </h3>
                                <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">{category.subtitle}</p>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 lg:gap-4">
                                {category.features.map((feature) => (
                                    <FeatureCard
                                        key={feature.key}
                                        feature={feature}
                                        accent={category.accent}
                                        ticketAppUrl={ticketAppUrl}
                                    />
                                ))}
                            </div>
                        </div>
                    );
                })}

                <div className="rounded-xl lg:rounded-2xl p-4 sm:p-5 bg-gradient-to-r from-slate-800 to-slate-900 text-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="flex items-start gap-3">
                        <div className="p-2 rounded-xl bg-white/10 shrink-0">
                            <Bell size={18} />
                        </div>
                        <div>
                            <p className="text-sm font-black tracking-tight">Push notifications enabled</p>
                            <p className="text-[11px] text-white/70 mt-0.5 max-w-md">
                                Get alerts for announcements, registration deadlines, fee reminders, and service request updates.
                            </p>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2 shrink-0">
                        {isEnabled('announcements') && (
                            <Link
                                to="/student/announcements"
                                className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-[10px] font-black uppercase tracking-widest border border-white/20 transition-colors"
                            >
                                View Notices
                            </Link>
                        )}
                        {isEnabled('attendance') && (
                            <Link
                                to="/student/attendance"
                                className="px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-[10px] font-black uppercase tracking-widest transition-colors"
                            >
                                My Attendance
                            </Link>
                        )}
                    </div>
                </div>
            </div>
        </section>
    );
};

export default StudentPortalHomeFeatures;
