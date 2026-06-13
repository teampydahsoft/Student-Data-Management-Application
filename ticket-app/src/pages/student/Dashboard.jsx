import React from 'react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import {
    Ticket,
    Clock,
    CheckCircle,
    Plus,
    ArrowRight,
    Activity,
    Shield
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../config/api';
import { SkeletonBox, StudentDashboardSkeleton } from '../../components/SkeletonLoader';
import '../../styles/student-pages.css';

import useAuthStore from '../../store/authStore';
import { getWorkspaceLinks, getHrmsOnlyReturnLink, isHrmsOnlyTicketUser } from '../../utils/hrmsPortal';

const Dashboard = () => {
    const navigate = useNavigate();
    const { token, user } = useAuthStore();
    const isHrmsOnly = isHrmsOnlyTicketUser(user);
    const hrmsReturnLink = getHrmsOnlyReturnLink();
    const workspaceLinks = isHrmsOnly ? [] : getWorkspaceLinks(user, { token });

    // Fetch tickets data for summary
    const { data: tickets = [], isLoading } = useQuery({
        queryKey: ['tickets'],
        queryFn: async () => {
            const response = await api.get('/tickets/student');
            return response.data?.data || [];
        }
    });

    const stats = React.useMemo(() => ({
        total: tickets.length,
        pending: tickets.filter(t => t.status === 'pending').length,
        resolved: tickets.filter(t => ['completed', 'closed'].includes(t.status)).length,
        active: tickets.filter(t => ['approaching', 'resolving'].includes(t.status)).length
    }), [tickets]);

    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: {
                staggerChildren: 0.1
            }
        }
    };

    const itemVariants = {
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0 }
    };

    if (isLoading) {
        return <StudentDashboardSkeleton />;
    }

    return (
        <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="student-page-container"
        >
            {/* Welcome Header */}
            {/* Welcome Header */}
            <div className="page-header animate-fade-in-up">
                <h1 className="page-title">
                    Ticket Management
                </h1>
                <p className="page-subtitle">
                    Manage and track your support requests and issues.
                </p>
            </div>

            {/* Stats Overview */}
            <div className="stats-grid">
                {[
                    { label: 'Total Tickets', value: stats.total, icon: Ticket, color: 'blue' },
                    { label: 'Pending', value: stats.pending, icon: Clock, color: 'yellow' },
                    { label: 'In Progress', value: stats.active, icon: Activity, color: 'purple' },
                    { label: 'Resolved', value: stats.resolved, icon: CheckCircle, color: 'green' }
                ].map((stat, idx) => (
                    <motion.div
                        key={idx}
                        variants={itemVariants}
                        className="stat-card"
                        style={{
                            background: stat.color === 'blue' ? 'linear-gradient(135deg, #ffffff 0%, #eff6ff 100%)' :
                                stat.color === 'yellow' ? 'linear-gradient(135deg, #ffffff 0%, #fefce8 100%)' :
                                    stat.color === 'purple' ? 'linear-gradient(135deg, #ffffff 0%, #f3e8ff 100%)' :
                                        'linear-gradient(135deg, #ffffff 0%, #f0fdf4 100%)',
                            borderColor: stat.color === 'blue' ? '#bfdbfe' :
                                stat.color === 'yellow' ? '#fde047' :
                                    stat.color === 'purple' ? '#e9d5ff' :
                                        '#bbf7d0'
                        }}
                    >
                        <div style={{ position: 'relative', zIndex: 10, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div className="stat-icon-box" style={{
                                backgroundColor: stat.color === 'blue' ? '#eff6ff' : stat.color === 'yellow' ? '#fefce8' : stat.color === 'purple' ? '#f3e8ff' : '#f0fdf4',
                                color: stat.color === 'blue' ? '#2563eb' : stat.color === 'yellow' ? '#ca8a04' : stat.color === 'purple' ? '#9333ea' : '#16a34a'
                            }}>
                                <stat.icon size={24} />
                            </div>
                            <div>
                                <h3 className="stat-label">{stat.label}</h3>
                                <p className="stat-value">{stat.value}</p>
                            </div>
                        </div>
                    </motion.div>
                ))}
            </div>

            <div className="dashboard-main-grid">
                {/* Recent Activity */}
                <motion.div variants={itemVariants} className="col-span-8 flex-col" style={{ gap: '1rem' }}>
                    <div className="flex-between mb-4">
                        <h2 className="heading-font" style={{ fontSize: '1.25rem', fontWeight: 900 }}>Recent Tickets</h2>
                        <Link to="/student/my-tickets" style={{ fontSize: '0.875rem', fontWeight: 700, color: '#2563eb', display: 'flex', alignItems: 'center', gap: '0.25rem', textDecoration: 'none' }}>
                            View All <ArrowRight size={16} />
                        </Link>
                    </div>

                    {tickets.length > 0 ? (
                        <div className="flex-col" style={{ gap: '1rem' }}>
                            {tickets.slice(0, 3).map((ticket) => (
                                <div
                                    key={ticket.id}
                                    className="ticket-item"
                                    onClick={() => navigate('/student/my-tickets')}
                                >
                                    <div className="flex-start" style={{ gap: '1rem' }}>
                                        <div className="ticket-icon-circle">
                                            <Ticket size={24} />
                                        </div>
                                        <div className="ticket-info">
                                            <h4>{ticket.title}</h4>
                                            <p>#{ticket.ticket_number} • {new Date(ticket.created_at).toLocaleDateString()}</p>
                                        </div>
                                    </div>
                                    <div className={`status-badge ${ticket.status === 'completed' ? 'status-completed' :
                                        ['approaching', 'resolving'].includes(ticket.status) ? 'status-active' :
                                            'status-pending'
                                        }`}>
                                        {ticket.status}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="card-base" style={{ textAlign: 'center', padding: '3rem', borderStyle: 'dashed' }}>
                            <div style={{ width: '4rem', height: '4rem', backgroundColor: '#eff6ff', borderRadius: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem auto' }}>
                                <Shield className="text-blue-600" size={32} color="#2563eb" />
                            </div>
                            <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#111827' }}>No active tickets</h3>
                            <p style={{ color: '#6b7280', marginTop: '0.25rem', marginBottom: '1.5rem', fontSize: '0.875rem' }}>Your support record is currently clean.</p>
                            <Link
                                to="/student/raise-ticket"
                                className="btn-primary"
                            >
                                <Plus size={20} />
                                Raise First Ticket
                            </Link>
                        </div>
                    )}
                </motion.div>

                {/* Quick Actions */}
                <motion.div variants={itemVariants} className="col-span-4 flex-col" style={{ gap: '1.5rem' }}>
                    <h2 className="heading-font" style={{ fontSize: '1.25rem', fontWeight: 700 }}>Quick Actions</h2>
                    <div className="flex-col" style={{ gap: '1rem' }}>
                        <Link
                            to="/student/raise-ticket"
                            className="action-card primary"
                        >
                            <div style={{ position: 'relative', zIndex: 10, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                <div style={{ padding: '0.75rem', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: '0.75rem', width: 'fit-content', backdropFilter: 'blur(4px)' }}>
                                    <Plus size={24} />
                                </div>
                                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '-0.025em', fontFamily: 'Poppins, sans-serif' }}>Raise Ticket</h3>
                                <p style={{ fontSize: '0.875rem', fontWeight: 500, opacity: 0.9, lineHeight: 1.5 }}>Need help with something? Let us know immediately and we'll resolve it.</p>
                            </div>
                        </Link>

                        {isHrmsOnly && (
                            <a
                                href={hrmsReturnLink.href}
                                className="action-card secondary hrms-return-card"
                                style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
                            >
                                <div style={{ position: 'relative', zIndex: 10 }}>
                                    <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '-0.025em', fontFamily: 'Poppins, sans-serif' }}>
                                        {hrmsReturnLink.label}
                                    </h3>
                                    <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1.5rem', lineHeight: 1.5 }}>
                                        Return to the HRMS dashboard (your HRMS session stays active in this browser).
                                    </p>
                                    <span
                                        className="btn-secondary"
                                        style={{ width: '100%', fontSize: '0.875rem', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}
                                    >
                                        Open HRMS Dashboard
                                    </span>
                                </div>
                            </a>
                        )}

                        {workspaceLinks.map((link) => (
                            <div key={link.id} className={`action-card secondary workspace-link-card${link.id === 'hrms' ? ' workspace-links-mobile-hidden' : ''}`}>
                                <div style={{ position: 'relative', zIndex: 10 }}>
                                    <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '-0.025em', fontFamily: 'Poppins, sans-serif' }}>
                                        {link.label}
                                    </h3>
                                    <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1.5rem', lineHeight: 1.5 }}>
                                        {link.id === 'hrms'
                                            ? 'Open the HRMS application for employee services and profile.'
                                            : 'Access the Student Database portal for admin and academic modules.'}
                                    </p>
                                    <a
                                        href={link.href}
                                        target={link.external ? '_blank' : undefined}
                                        rel={link.external ? 'noopener noreferrer' : undefined}
                                        className="btn-secondary"
                                        style={{ width: '100%', fontSize: '0.875rem', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}
                                    >
                                        Open {link.label}
                                    </a>
                                </div>
                            </div>
                        ))}
                    </div>
                </motion.div>
            </div>
        </motion.div>
    );
};

export default Dashboard;
