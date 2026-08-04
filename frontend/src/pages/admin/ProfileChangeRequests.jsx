import React, { useState, useEffect, useMemo } from 'react';
import { Search, Eye, Check, X, Clock, User, AlertCircle, ChevronRight } from 'lucide-react';
import api from '../../config/api';
import toast from 'react-hot-toast';

export const ProfileChangeRequests = () => {
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('pending');
    const [courseFilter, setCourseFilter] = useState('');
    const [branchFilter, setBranchFilter] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedRequest, setSelectedRequest] = useState(null);
    const [reviewComments, setReviewComments] = useState('');
    const [studentOriginalData, setStudentOriginalData] = useState({});
    const [filterOptions, setFilterOptions] = useState({ courses: [], branches: [] });
    const [coursesWithBranches, setCoursesWithBranches] = useState([]);

    useEffect(() => {
        const loadFilterMeta = async () => {
            try {
                const [quickRes, coursesRes] = await Promise.all([
                    api.get('/students/quick-filters?applyExclusions=true'),
                    api.get('/courses?includeInactive=false')
                ]);
                if (quickRes.data?.success) {
                    const d = quickRes.data.data || {};
                    setFilterOptions({
                        courses: d.courses || [],
                        branches: d.branches || []
                    });
                }
                if (coursesRes.data?.success) {
                    setCoursesWithBranches(coursesRes.data.data || []);
                }
            } catch (err) {
                console.warn('Failed to load course/branch filter options:', err);
            }
        };
        loadFilterMeta();
    }, []);

    // Cascade branch options when course changes
    useEffect(() => {
        const updateBranches = async () => {
            try {
                const params = new URLSearchParams({ applyExclusions: 'true' });
                if (courseFilter) params.append('course', courseFilter);
                const res = await api.get(`/students/quick-filters?${params.toString()}`);
                if (res.data?.success) {
                    const d = res.data.data || {};
                    setFilterOptions((prev) => ({
                        ...prev,
                        courses: courseFilter ? prev.courses : (d.courses?.length ? d.courses : prev.courses),
                        branches: d.branches || []
                    }));
                }
            } catch (err) {
                console.warn('Failed to update branch options:', err);
            }
        };
        updateBranches();
    }, [courseFilter]);

    const availableCourses = useMemo(() => {
        if (coursesWithBranches?.length) {
            return [...new Set(coursesWithBranches.map((c) => c.name).filter(Boolean))].sort();
        }
        return [...new Set(filterOptions.courses || [])].sort();
    }, [coursesWithBranches, filterOptions.courses]);

    const availableBranches = useMemo(() => {
        if (courseFilter && coursesWithBranches?.length) {
            const course = coursesWithBranches.find(
                (c) => c.name?.toLowerCase() === courseFilter.toLowerCase()
            );
            const fromCourse = (course?.branches || [])
                .map((b) => (typeof b === 'string' ? b : b?.name))
                .filter(Boolean);
            if (fromCourse.length) {
                return [...new Set(fromCourse)].sort();
            }
        }
        return [...new Set(filterOptions.branches || [])].sort();
    }, [courseFilter, coursesWithBranches, filterOptions.branches]);

    useEffect(() => {
        fetchRequests();
    }, [statusFilter, courseFilter, branchFilter]);

    const fetchRequests = async () => {
        try {
            setLoading(true);
            const params = new URLSearchParams();
            if (statusFilter !== 'all') params.append('status', statusFilter);
            if (courseFilter) params.append('course', courseFilter);
            if (branchFilter) params.append('branch', branchFilter);
            const query = params.toString() ? `?${params.toString()}` : '';
            const res = await api.get(`/profile-changes/all${query}`);
            if (res.data?.success) {
                setRequests(res.data.data);
            } else {
                toast.error('Failed to fetch requests');
            }
        } catch (error) {
            console.error('Error fetching requests', error);
            toast.error('Failed to fetch requests');
        } finally {
            setLoading(false);
        }
    };

    const handleCourseChange = (value) => {
        setCourseFilter(value);
        setBranchFilter('');
    };

    const handleReview = async (status) => {
        if (!selectedRequest) return;

        try {
            const res = await api.put(`/profile-changes/${selectedRequest.id}/status`, {
                status,
                comments: reviewComments
            });

            if (res.data?.success) {
                toast.success(`Request ${status} successfully`);
                setSelectedRequest(null);
                setReviewComments('');
                fetchRequests();
            } else {
                toast.error(res.data?.message || `Failed to ${status} request`);
            }
        } catch (error) {
            console.error('Error updating request', error);
            toast.error(error.response?.data?.message || `Failed to ${status} request`);
        }
    };

    const parseChanges = (changes) => {
        if (typeof changes === 'string') {
            try { return JSON.parse(changes); }
            catch { return {}; }
        }
        return changes || {};
    };

    const filteredRequests = requests.filter(req => {
        const term = searchTerm.toLowerCase();
        if (!term) return true;
        return (
            req.student_name?.toLowerCase().includes(term) ||
            req.admission_number?.toLowerCase().includes(term) ||
            req.course?.toLowerCase().includes(term) ||
            req.branch?.toLowerCase().includes(term)
        );
    });

    const formatKey = (key) => {
        return key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 heading-font">Profile Change Requests</h1>
                    <p className="text-sm text-gray-500 mt-1">Review and approve student profile update requests</p>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 md:p-6">
                {/* Filters */}
                <div className="flex flex-col gap-4 mb-6">
                    <div className="flex flex-col md:flex-row gap-4">
                        <div className="flex-1 relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                            <input
                                type="text"
                                placeholder="Search by student name or admission number..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm"
                            />
                        </div>
                        <div className="flex gap-2 shrink-0 overflow-x-auto pb-2 md:pb-0">
                            {['pending', 'approved', 'rejected', 'all'].map(status => (
                                <button
                                    key={status}
                                    onClick={() => setStatusFilter(status)}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap capitalize ${statusFilter === status
                                        ? 'bg-indigo-600 text-white'
                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                        }`}
                                >
                                    {status}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Course / Program</label>
                            <select
                                value={courseFilter}
                                onChange={(e) => handleCourseChange(e.target.value)}
                                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white"
                            >
                                <option value="">All Courses</option>
                                {availableCourses.map((course) => (
                                    <option key={course} value={course.id || course}>{course.name || course}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Branch</label>
                            <select
                                value={branchFilter}
                                onChange={(e) => setBranchFilter(e.target.value)}
                                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white"
                            >
                                <option value="">All Branches</option>
                                {availableBranches.map((branch) => (
                                    <option key={branch} value={branch.id || branch}>{branch.name || branch}</option>
                                ))}
                            </select>
                        </div>
                        {(courseFilter || branchFilter) && (
                            <div className="flex items-end">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setCourseFilter('');
                                        setBranchFilter('');
                                    }}
                                    className="text-sm text-indigo-600 hover:text-indigo-800 font-medium px-1 py-2"
                                >
                                    Clear course / branch
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Student Details</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Requested Changes</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {loading ? (
                                <tr>
                                    <td colSpan="5" className="px-6 py-12 text-center text-gray-500">
                                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-4"></div>
                                        Loading requests...
                                    </td>
                                </tr>
                            ) : filteredRequests.length === 0 ? (
                                <tr>
                                    <td colSpan="5" className="px-6 py-12 text-center text-gray-500">
                                        <div className="bg-gray-50 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                                            <AlertCircle size={32} className="text-gray-400" />
                                        </div>
                                        <p className="text-gray-600 font-medium text-lg">No {statusFilter !== 'all' ? statusFilter : ''} requests found</p>
                                    </td>
                                </tr>
                            ) : (
                                filteredRequests.map(req => {
                                    const changes = parseChanges(req.requested_changes);
                                    const changeKeys = Object.keys(changes);

                                    return (
                                        <tr key={req.id} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="flex items-center">
                                                    <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold shrink-0">
                                                        {req.student_name ? req.student_name.charAt(0).toUpperCase() : <User size={18} />}
                                                    </div>
                                                    <div className="ml-4">
                                                        <div className="text-sm font-semibold text-gray-900">{req.student_name}</div>
                                                        <div className="text-xs text-gray-500">{req.admission_number}</div>
                                                        <div className="text-[10px] text-gray-400 mt-0.5">{req.course} • {req.branch}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-wrap gap-1 mt-1">
                                                    {changeKeys.slice(0, 3).map(key => (
                                                        <span key={key} className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-800">
                                                            {formatKey(key)}
                                                        </span>
                                                    ))}
                                                    {changeKeys.length > 3 && (
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-800">
                                                            +{changeKeys.length - 3} more
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                {new Date(req.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize
                                                    ${req.status === 'pending' ? 'bg-amber-100 text-amber-800' :
                                                        req.status === 'approved' ? 'bg-green-100 text-green-800' :
                                                            'bg-red-100 text-red-800'}`}>
                                                    {req.status === 'pending' && <Clock size={12} className="mr-1" />}
                                                    {req.status === 'approved' && <Check size={12} className="mr-1" />}
                                                    {req.status === 'rejected' && <X size={12} className="mr-1" />}
                                                    {req.status}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                <button
                                                    onClick={async () => {
                                                        setSelectedRequest(req);
                                                        // Fetch student original data for comparison
                                                        try {
                                                            const res = await api.get(`/students/${req.admission_number}`);
                                                            if (res.data?.success) {
                                                                setStudentOriginalData(res.data.data);
                                                            }
                                                        } catch (err) {
                                                            console.error("Failed to fetch original data");
                                                        }
                                                    }}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
                                                >
                                                    <Eye size={16} /> Review
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Review Modal */}
            {selectedRequest && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm shadow-2xl animate-fade-in custom-scrollbar overflow-y-auto">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl flex flex-col relative my-auto">
                        <div className="flex justify-between items-center p-6 border-b border-gray-100">
                            <div>
                                <h2 className="text-xl font-bold text-gray-900 heading-font">Review Change Request</h2>
                                <p className="text-xs text-gray-500 mt-1">Submitted on {new Date(selectedRequest.created_at).toLocaleString()}</p>
                            </div>
                            <button onClick={() => setSelectedRequest(null)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                                <X size={20} className="text-gray-500" />
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto max-h-[60vh] custom-scrollbar space-y-6">
                            {/* Student Base Info */}
                            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Student Details</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div><span className="text-xs text-gray-500 block">Name</span><span className="font-semibold text-gray-900 text-sm">{selectedRequest.student_name}</span></div>
                                    <div><span className="text-xs text-gray-500 block">Admission No</span><span className="font-semibold text-gray-900 text-sm">{selectedRequest.admission_number}</span></div>
                                    <div><span className="text-xs text-gray-500 block">Course</span><span className="font-semibold text-gray-900 text-sm">{selectedRequest.course} ({selectedRequest.branch})</span></div>
                                    <div><span className="text-xs text-gray-500 block">Year/Sem</span><span className="font-semibold text-gray-900 text-sm">Y{selectedRequest.current_year} S{selectedRequest.current_semester}</span></div>
                                </div>
                            </div>

                            {/* Requested Changes */}
                            <div>
                                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 border-b pb-2">Requested Updates</h3>
                                <div className="space-y-3">
                                    {Object.entries(parseChanges(selectedRequest.requested_changes)).map(([key, value]) => {
                                        // Attempt to get the original value from the DB
                                        let oldVal = studentOriginalData[key];
                                        if (oldVal === undefined && studentOriginalData.student_data) {
                                            let parsed = {};
                                            if (typeof studentOriginalData.student_data === 'string') {
                                                try { parsed = JSON.parse(studentOriginalData.student_data); } catch (e) { }
                                            } else {
                                                parsed = studentOriginalData.student_data;
                                            }
                                            oldVal = parsed[key] || parsed[formatKey(key)];
                                        }

                                        return (
                                            <div key={key} className="flex flex-col sm:flex-row sm:items-center p-3 sm:px-4 bg-blue-50/30 rounded-lg border border-blue-100/50 hover:bg-blue-50 transition-colors gap-3 sm:gap-4">
                                                <div className="sm:w-1/4">
                                                    <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">{formatKey(key)}</span>
                                                </div>
                                                <div className="flex-1 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                                                    <div className="flex-1">
                                                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">Current</span>
                                                        <span className="text-sm font-medium text-gray-600 break-words bg-gray-100 px-3 py-1.5 border border-gray-200 rounded-md block min-h-[34px]">{oldVal || '(Empty)'}</span>
                                                    </div>
                                                    <div className="hidden sm:flex text-gray-300">
                                                        <ChevronRight size={16} />
                                                    </div>
                                                    <div className="flex-1">
                                                        <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest block mb-1">Requested</span>
                                                        <span className="text-sm font-semibold text-indigo-800 break-words bg-white px-3 py-1.5 border border-indigo-200 rounded-md shadow-sm block min-h-[34px]">{value || '(Empty)'}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Reviewer Comments */}
                            {selectedRequest.status === 'pending' && (
                                <div>
                                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Admin Comments (Optional)</h3>
                                    <textarea
                                        value={reviewComments}
                                        onChange={(e) => setReviewComments(e.target.value)}
                                        placeholder="Add comments, reason for rejection, etc."
                                        rows={3}
                                        className="w-full p-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
                                    ></textarea>
                                </div>
                            )}

                            {/* Show previous reviewer details if already processed */}
                            {selectedRequest.status !== 'pending' && (
                                <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 mt-4">
                                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Review Details</h3>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div><span className="text-xs text-gray-500 block">Reviewed By</span><span className="font-semibold text-gray-900 text-sm">{selectedRequest.reviewed_by}</span></div>
                                        <div><span className="text-xs text-gray-500 block">Status</span>
                                            <span className={`inline-flex items-center rounded-full text-xs font-semibold capitalize ${selectedRequest.status === 'approved' ? 'text-green-600' : 'text-red-600'}`}>
                                                {selectedRequest.status}
                                            </span>
                                        </div>
                                        {selectedRequest.comments && (
                                            <div className="col-span-2"><span className="text-xs text-gray-500 block">Comments</span><span className="text-gray-900 text-sm whitespace-pre-wrap">{selectedRequest.comments}</span></div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        {selectedRequest.status === 'pending' && (
                            <div className="p-6 border-t border-gray-100 flex items-center justify-end gap-3 bg-gray-50 rounded-b-2xl">
                                <button type="button" onClick={() => setSelectedRequest(null)} className="px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-200 rounded-lg transition-colors">
                                    Cancel
                                </button>
                                <button
                                    onClick={() => handleReview('rejected')}
                                    className="px-5 py-2.5 text-sm font-semibold rounded-lg text-red-700 bg-red-100 hover:bg-red-200 flex items-center gap-2 transition-colors shadow-sm"
                                >
                                    <X size={16} /> Reject
                                </button>
                                <button
                                    onClick={() => handleReview('approved')}
                                    className="px-5 py-2.5 text-sm font-semibold rounded-lg text-white bg-green-600 hover:bg-green-700 flex items-center gap-2 transition-colors shadow-sm"
                                >
                                    <Check size={16} /> Approve & Update
                                </button>
                            </div>
                        )}
                        {selectedRequest.status !== 'pending' && (
                            <div className="p-6 border-t border-gray-100 flex items-center justify-end bg-gray-50 rounded-b-2xl">
                                <button type="button" onClick={() => setSelectedRequest(null)} className="px-5 py-2.5 text-sm font-semibold bg-gray-200 text-gray-700 hover:bg-gray-300 rounded-lg transition-colors">
                                    Close
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProfileChangeRequests;
