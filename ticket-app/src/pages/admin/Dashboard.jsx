import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Ticket, Users, CheckCircle, Clock, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../../config/api';
import '../../styles/admin-pages.css';
import { DashboardSkeleton } from '../../components/SkeletonLoader';

import useAuthStore from '../../store/authStore';
import { getWorkspaceLinks } from '../../utils/hrmsPortal';

const AdminDashboard = () => {
    const navigate = useNavigate();
    const { token, user } = useAuthStore();
    const workspaceLinks = getWorkspaceLinks(user, { token });

    // Fetch ticket stats
    const { data: statsData, isLoading } = useQuery({
        queryKey: ['ticket-stats'],
        queryFn: async () => {
            const response = await api.get('/tickets/stats');
            return response.data?.data || {};
        }
    });

    if (isLoading) {
        return (
            <div className="admin-page-container">
                <DashboardSkeleton />
            </div>
        );
    }

    const stats = statsData || {};
    const byStatus = stats.by_status || [];

    const getCount = (status) => {
        const stat = byStatus.find(s => s.status === status);
        return stat ? stat.count : 0;
    };

    const totalTickets = byStatus.reduce((acc, curr) => acc + curr.count, 0);

    // Helper for stat card rendering
    const StatCard = ({ label, value, icon: Icon, color, onClick }) => {
        // We will move away from direct style props to classes where possible, or keep simple variable styles
        // for ease of customization for these specific gradient cards.
        return (
            <div
                className={`stat-card cursor-pointer stat-card-${color}`}
                onClick={onClick}
            >
                <div>
                    <div className={`stat-icon-box stat-icon-${color}`}>
                        <Icon size={24} />
                    </div>
                    <div>
                        <h3 className="stat-label">{label}</h3>
                        <p className="stat-value">{value}</p>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="admin-page-container">
            {/* Header */}
            <div className="page-header animate-fade-in">
                <h1 className="page-title">Admin Dashboard</h1>
                <p className="page-subtitle">Overview of ticket management system</p>
            </div>

            {/* Stats Grid */}
            <div className="stats-grid animate-fade-in">
                <StatCard
                    label="Total Tickets"
                    value={totalTickets}
                    icon={Ticket}
                    color="blue"
                    onClick={() => navigate('/task-management')}
                />
                <StatCard
                    label="Pending Actions"
                    value={getCount('pending')}
                    icon={Clock}
                    color="yellow"
                    onClick={() => navigate('/task-management')}
                />
                <StatCard
                    label="Resolving"
                    value={getCount('resolving')}
                    icon={Users}
                    color="purple"
                    onClick={() => navigate('/task-management')}
                />
                <StatCard
                    label="Completed"
                    value={getCount('completed')}
                    icon={CheckCircle}
                    color="green"
                    onClick={() => navigate('/task-management')}
                />
            </div>

            {/* Quick Actions */}
            <div className="dashboard-main-grid animate-fade-in" style={{ animationDelay: '0.1s' }}>
                <div className="col-span-12">
                    <h2 className="dashboard-section-title">Quick Actions</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div
                            className="card-base hover:shadow-md cursor-pointer transition-all bg-white"
                            onClick={() => navigate('/task-management')}
                        >
                            <div className="flex items-center gap-4">
                                <div className="quick-action-icon icon-blue">
                                    <Clock size={24} />
                                </div>
                                <div className="flex-1">
                                    <h3 className="font-bold text-gray-900">Review Pending Tasks</h3>
                                    <p className="text-sm text-gray-500 mt-1">Check tickets that need attention</p>
                                </div>
                                <ArrowRight size={20} className="text-gray-300" />
                            </div>
                        </div>

                        <div
                            className="card-base hover:shadow-md cursor-pointer transition-all bg-white"
                            onClick={() => navigate('/employees')}
                        >
                            <div className="flex items-center gap-4">
                                <div className="quick-action-icon icon-purple">
                                    <Users size={24} />
                                </div>
                                <div className="flex-1">
                                    <h3 className="font-bold text-gray-900">Manage Employees</h3>
                                    <p className="text-sm text-gray-500 mt-1">Assign managers and workers</p>
                                </div>
                                <ArrowRight size={20} className="text-gray-300" />
                            </div>
                        </div>

                        <div
                            className="card-base hover:shadow-md cursor-pointer transition-all bg-white"
                            onClick={() => navigate('/configuration')}
                        >
                            <div className="flex items-center gap-4">
                                <div className="quick-action-icon icon-green">
                                    <Ticket size={24} />
                                </div>
                                <div className="flex-1">
                                    <h3 className="font-bold text-gray-900">System Configuration</h3>
                                    <p className="text-sm text-gray-500 mt-1">Update ticket headers and settings</p>
                                </div>
                                <ArrowRight size={20} className="text-gray-300" />
                            </div>
                        </div>
                        {workspaceLinks.map((link) => (
                            <div
                                key={link.id}
                                className="card-base hover:shadow-md cursor-pointer transition-all bg-white"
                                onClick={() => {
                                    if (link.external) {
                                        window.open(link.href, '_blank', 'noopener,noreferrer');
                                    } else {
                                        window.location.href = link.href;
                                    }
                                }}
                            >
                                <div className="flex items-center gap-4">
                                    <div className="quick-action-icon text-blue-600 bg-blue-50 flex items-center justify-center rounded-lg" style={{ width: '40px', height: '40px' }}>
                                        <div style={{ transform: 'rotate(180deg)' }}>
                                            <ArrowRight size={24} />
                                        </div>
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="font-bold text-gray-900">{link.label}</h3>
                                        <p className="text-sm text-gray-500 mt-1">
                                            {link.id === 'hrms' ? 'Open HRMS application' : 'Switch to main application'}
                                        </p>
                                    </div>
                                    <ArrowRight size={20} className="text-gray-300" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminDashboard;
