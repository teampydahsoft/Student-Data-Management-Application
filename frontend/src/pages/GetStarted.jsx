import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
import {
    GraduationCap,
    ArrowRight,
    CheckCircle,
    Smartphone,
    ShieldCheck,
    Zap,
    LogIn,
    BookOpen,
    Calendar,
    ClipboardList,
    Award
} from 'lucide-react';

const GetStarted = () => {
    const navigate = useNavigate();
    const [isOnline, setIsOnline] = useState(navigator.onLine);

    // Monitoring browser online/offline status
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


    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: {
                staggerChildren: 0.2
            }
        }
    };

    const itemVariants = {
        hidden: { opacity: 0, y: 20 },
        visible: {
            opacity: 1,
            y: 0,
            transition: { duration: 0.5, ease: "easeOut" }
        }
    };

    const features = [
        {
            icon: <BookOpen className="text-accent" size={24} />,
            title: "Academic Tracking",
            description: "Monitor your grades, semesters, and overall academic performance in real-time."
        },
        {
            icon: <Calendar className="text-accent" size={24} />,
            title: "Attendance Management",
            description: "Keep track of your daily attendance and never miss a requirement."
        },
        {
            icon: <Smartphone className="text-accent" size={24} />,
            title: "Mobile First",
            description: "Access your student portal anywhere, anytime, on any device."
        },
        {
            icon: <ClipboardList className="text-accent" size={24} />,
            title: "Service Requests",
            description: "Apply for certificates, bonafides, and other services with ease."
        }
    ];

    return (
        <div className="min-h-screen bg-secondary font-body selection:bg-accent/30">
            {/* Online Status Toast (Subtle) */}
            {!isOnline && (
                <div className="fixed bottom-4 left-4 z-[100] bg-red-500 text-white px-4 py-2 rounded-full text-xs font-bold shadow-lg flex items-center gap-2 animate-bounce">
                    <div className="w-2 h-2 bg-white rounded-full animate-ping" />
                    Offline Mode
                </div>
            )}

            {/* Navigation */}
            <nav className="fixed top-0 w-full z-50 bg-white/70 backdrop-blur-md border-b border-border-light px-6 py-4 flex justify-between items-center">
                <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/')}>
                    <div className="p-1 px-3 bg-primary/5 rounded-xl border border-primary/10 shadow-sm flex items-center justify-center">
                        <img
                            src="/logo.png"
                            alt="Logo"
                            className="h-10 w-auto object-contain"
                            onError={(e) => e.target.style.display = 'none'}
                        />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-lg sm:text-xl font-bold text-primary tracking-tight leading-tight">Pydah Group</span>
                        <span className="text-[9px] sm:text-[10px] font-bold text-accent uppercase tracking-[0.15em] sm:tracking-[0.2em] leading-tight">Student Portal</span>
                    </div>
                </div>
                <div className="flex items-center gap-2 sm:gap-4">
                    <button
                        onClick={() => navigate('/login')}
                        className="hidden sm:flex items-center gap-2 text-primary font-semibold hover:text-primary-light transition-all"
                    >
                        <LogIn size={18} />
                        <span>Login</span>
                    </button>
                    <button
                        onClick={() => navigate('/login')}
                        className="bg-primary text-white px-4 sm:px-6 py-2 sm:py-2.5 rounded-lg sm:rounded-xl text-sm sm:text-base font-semibold hover:bg-primary-dark transition-all shadow-md active:scale-95"
                    >
                        Get Started
                    </button>
                </div>
            </nav>

            {/* Hero Section */}
            <section className="relative pt-24 sm:pt-32 pb-16 sm:pb-20 px-4 sm:px-6 max-w-7xl mx-auto overflow-hidden">
                <div className="grid lg:grid-cols-2 gap-12 items-center">
                    <motion.div
                        initial="hidden"
                        animate="visible"
                        variants={containerVariants}
                        className="z-10"
                    >
                        <motion.h1
                            variants={itemVariants}
                            className="text-5xl lg:text-7xl font-bold text-primary mb-6 leading-[1.1]"
                        >
                            Empower Your <span className="text-accent">Academic</span> Journey
                        </motion.h1>
                        <motion.p
                            variants={itemVariants}
                            className="text-lg text-text-secondary mb-8 max-w-xl leading-relaxed"
                        >
                            The ultimate platform for students to manage their academic life, track progress, and stay connected with the campus ecosystem. All in one place.
                        </motion.p>
                        <motion.div variants={itemVariants} className="flex flex-col sm:flex-row gap-4">
                            <button
                                onClick={() => navigate('/login')}
                                className="group bg-primary text-white px-8 py-4 rounded-2xl font-bold text-lg hover:bg-primary-dark transition-all shadow-xl flex items-center justify-center gap-2 hover:gap-4 active:scale-95"
                            >
                                Launch Portal
                                <ArrowRight size={20} className="transition-all" />
                            </button>
                            <button
                                className="px-8 py-4 rounded-2xl font-bold text-lg text-primary border-2 border-primary/10 hover:bg-primary/5 transition-all flex items-center justify-center gap-2"
                            >
                                Watch Demo
                            </button>
                        </motion.div>


                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, scale: 0.8, rotate: 5 }}
                        animate={{ opacity: 1, scale: 1, rotate: 0 }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                        className="relative"
                    >
                        <div className="absolute inset-0 bg-accent/20 blur-[120px] rounded-full" />
                        <div className="relative bg-white p-2 sm:p-4 rounded-[2.5rem] shadow-2xl border-8 border-primary/5 overflow-hidden group flex items-center justify-center min-h-[400px] bg-gradient-to-br from-primary/5 to-accent/5">
                            <img
                                src="https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&q=80&w=1000"
                                alt="Students"
                                className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-primary/60 via-transparent to-transparent opacity-80" />
                            <div className="absolute top-8 left-8 bg-white/90 backdrop-blur-md p-4 rounded-2xl shadow-xl flex items-center gap-3 border border-white/20 animate-float">
                                <div className="w-10 h-10 bg-success/20 rounded-full flex items-center justify-center">
                                    <CheckCircle className="text-success" size={20} />
                                </div>
                                <div>
                                    <p className="text-xs font-bold text-text-primary">Profile Verified</p>
                                    <p className="text-[10px] text-text-secondary">Official Student Acc</p>
                                </div>
                            </div>
                            <div className="absolute bottom-12 right-12 bg-primary/95 backdrop-blur-md p-4 rounded-2xl shadow-xl flex items-center gap-3 border border-white/10 animate-float delay-300">
                                <div className="w-10 h-10 bg-accent/20 rounded-full flex items-center justify-center">
                                    <Award className="text-accent" size={20} />
                                </div>
                                <div>
                                    <p className="text-xs font-bold text-white">9.2 CGPA</p>
                                    <p className="text-[10px] text-accent/80">Semester Dean's List</p>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* Stats Section */}
            <section className="bg-primary py-20">
                <div className="max-w-7xl mx-auto px-6">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
                        {[
                            { label: "Active Students", val: "5,000+" },
                            { label: "Course Modules", val: "120+" },
                            { label: "Total Requests", val: "15k+" },
                            { label: "Uptime", val: "99.9%" }
                        ].map((stat, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.1 }}
                                viewport={{ once: true }}
                            >
                                <h3 className="text-4xl font-bold text-accent mb-2">{stat.val}</h3>
                                <p className="text-accent-light text-sm tracking-wide uppercase font-semibold opacity-80">{stat.label}</p>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Features Grid */}
            <section className="py-32 px-6 max-w-7xl mx-auto">
                <div className="text-center mb-20">
                    <motion.h2
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-4xl md:text-5xl font-bold text-primary mb-6"
                    >
                        Tailored for Your <span className="text-accent">Success</span>
                    </motion.h2>
                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.1 }}
                        className="text-text-secondary max-w-2xl mx-auto text-lg"
                    >
                        Everything you need to navigate your college years effectively, built into a single, intuitive interface.
                    </motion.p>
                </div>

                <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
                    {features.map((feature, i) => (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: i * 0.1 }}
                            className="bg-white p-8 rounded-3xl border border-border-light shadow-sm hover:shadow-xl transition-all duration-300 group hover:-translate-y-2"
                        >
                            <div className="w-14 h-14 bg-accent/5 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-accent group-hover:text-white transition-colors duration-300">
                                {feature.icon}
                            </div>
                            <h4 className="text-xl font-bold text-primary mb-3">{feature.title}</h4>
                            <p className="text-text-secondary text-sm leading-relaxed">{feature.description}</p>
                        </motion.div>
                    ))}
                </div>
            </section>

            {/* Security Section */}
            <section className="bg-white py-24 border-y border-border-light overflow-hidden">
                <div className="max-w-7xl mx-auto px-6 flex flex-col lg:flex-row items-center gap-16">
                    <div className="flex-1">
                        <div className="w-16 h-16 bg-primary/5 rounded-2xl flex items-center justify-center mb-8">
                            <ShieldCheck className="text-primary" size={32} />
                        </div>
                        <h2 className="text-4xl font-bold text-primary mb-6">Your Data is Secure and Private</h2>
                        <p className="text-text-secondary text-lg mb-8 leading-relaxed italic">
                            "We prioritize the privacy and security of our student data above all else. Our systems use industry-standard encryption and security protocols."
                        </p>
                        <ul className="space-y-4">
                            {[
                                "End-to-end encryption for all documents",
                                "Advanced role-based access control",
                                "Real-time backup and disaster recovery",
                                "Compliance with educational data privacy norms"
                            ].map((text, i) => (
                                <li key={i} className="flex items-center gap-3 text-primary font-medium">
                                    <div className="w-5 h-5 bg-accent/20 rounded-full flex items-center justify-center">
                                        <CheckCircle className="text-accent" size={14} />
                                    </div>
                                    {text}
                                </li>
                            ))}
                        </ul>
                    </div>
                    <div className="flex-1 relative">
                        <div className="absolute inset-0 bg-primary/20 blur-[100px] rounded-full" />
                        <div className="relative grid grid-cols-2 gap-4">
                            <div className="space-y-4 pt-12">
                                <div className="bg-secondary p-6 rounded-3xl shadow-lg border border-border-light">
                                    <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center mb-4">
                                        <Zap className="text-primary" size={20} />
                                    </div>
                                    <p className="font-bold text-primary">Fast Performance</p>
                                </div>
                                <div className="bg-white p-6 rounded-3xl shadow-lg border border-border-light">
                                    <div className="w-10 h-10 bg-success/10 rounded-xl flex items-center justify-center mb-4">
                                        <ShieldCheck className="text-success" size={20} />
                                    </div>
                                    <p className="font-bold text-primary">Biometric Sync</p>
                                </div>
                            </div>
                            <div className="space-y-4">
                                <div className="bg-white p-6 rounded-3xl shadow-lg border border-border-light">
                                    <div className="w-10 h-10 bg-accent/10 rounded-xl flex items-center justify-center mb-4">
                                        <Smartphone className="text-accent" size={20} />
                                    </div>
                                    <p className="font-bold text-primary">Native Feel</p>
                                </div>
                                <div className="bg-secondary p-6 rounded-3xl shadow-lg border border-border-light">
                                    <div className="w-10 h-10 bg-info/10 rounded-xl flex items-center justify-center mb-4">
                                        <Calendar className="text-info" size={20} />
                                    </div>
                                    <p className="font-bold text-primary">Smart Alerts</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section className="py-32 px-6">
                <div className="max-w-5xl mx-auto bg-primary rounded-[3rem] p-12 lg:p-20 text-center relative overflow-hidden shadow-2xl">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-accent/10 blur-[80px] rounded-full" />
                    <div className="absolute bottom-0 left-0 w-64 h-64 bg-accent-light/10 blur-[80px] rounded-full" />

                    <div className="relative z-10">
                        <h2 className="text-4xl md:text-6xl font-bold text-white mb-8">Ready to Start Your Digital Campus Life?</h2>
                        <p className="text-accent-light text-xl mb-12 max-w-2xl mx-auto opacity-90 leading-relaxed">
                            Join thousands of students and faculty members who are already using our platform to make campus life seamless.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-6 justify-center">
                            <button
                                onClick={() => navigate('/login')}
                                className="bg-accent text-primary px-10 py-5 rounded-2xl font-bold text-xl hover:bg-accent-light transition-all shadow-xl active:scale-95"
                            >
                                Login as Student
                            </button>
                            <button
                                onClick={() => navigate('/login')}
                                className="bg-white/10 backdrop-blur-md text-white border border-white/20 px-10 py-5 rounded-2xl font-bold text-xl hover:bg-white/20 transition-all active:scale-95"
                            >
                                Faculty Access
                            </button>
                        </div>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="bg-white border-t border-border-light py-12 px-6">
                <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
                    <div className="flex items-center gap-3">
                        <img
                            src="/logo.png"
                            alt="Logo"
                            className="h-8 w-auto object-contain"
                            onError={(e) => e.target.style.display = 'none'}
                        />
                        <span className="text-lg font-bold text-primary tracking-tight">Student Portal</span>
                    </div>
                    <p className="text-text-secondary text-sm">
                        © {new Date().getFullYear()} Pydah Group of Institutions. All rights reserved.
                    </p>
                    <div className="flex items-center gap-6">
                        <a href="#" className="text-text-secondary hover:text-primary transition-colors text-sm font-medium">Privacy Policy</a>
                        <a href="#" className="text-text-secondary hover:text-primary transition-colors text-sm font-medium">Terms of Service</a>
                        <a href="#" className="text-text-secondary hover:text-primary transition-colors text-sm font-medium">Contact Us</a>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default GetStarted;
