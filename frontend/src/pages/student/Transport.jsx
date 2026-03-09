import React, { useEffect, useState } from 'react';
import transportService from '../../services/transportService';
import { toast } from 'react-hot-toast';
import { RiBusLine, RiMapPinLine, RiTicketLine, RiHistoryLine, RiTimeLine, RiCheckboxCircleFill } from 'react-icons/ri';

const Transport = () => {
    const [routes, setRoutes] = useState([]);
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);

    const [selectedRoute, setSelectedRoute] = useState(null);
    const [selectedStage, setSelectedStage] = useState(null);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [routeRes, reqRes] = await Promise.all([
                transportService.getRoutes(),
                transportService.getMyRequests()
            ]);
            setRoutes(routeRes.data.data || []);
            setRequests(reqRes.data.data || []);
        } catch (error) {
            console.error(error);
            toast.error('Failed to load transport details');
        } finally {
            setLoading(false);
        }
    };

    const handleRouteSelect = (e) => {
        const routeId = e.target.value;
        const route = routes.find(r => r.routeId === routeId);
        setSelectedRoute(route);
        setSelectedStage(null); // Reset stage
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!selectedRoute || !selectedStage) {
            toast.error('Please select a route and stage');
            return;
        }

        if (!window.confirm(`Confirm Request for Route: ${selectedRoute.routeName}, Stage: ${selectedStage.stageName}, Fare: ₹${selectedStage.fare}?`)) return;

        try {
            setSubmitting(true);
            await transportService.createRequest({
                route_id: selectedRoute.routeId,
                route_name: selectedRoute.routeName,
                stage_name: selectedStage.stageName,
                fare: selectedStage.fare,
                bus_id: null // Can be assigned later
            });
            toast.success('Transport request submitted successfully!');
            fetchData(); // Refresh history
            setSelectedRoute(null);
            setSelectedStage(null);
        } catch (error) {
            console.error(error);
            toast.error(error.response?.data?.message || 'Failed to submit request');
        } finally {
            setSubmitting(false);
        }
    };

    const getStatusBadge = (status) => {
        const styles = {
            pending: 'bg-yellow-100 text-yellow-800',
            approved: 'bg-green-100 text-green-800',
            rejected: 'bg-red-100 text-red-800'
        };
        return (
            <span className={`px-2 py-1 rounded-full text-xs font-bold uppercase ${styles[status]}`}>
                {status}
            </span>
        );
    };

    return (
        <div className="p-6 space-y-8 animate-fade-in max-w-7xl mx-auto">

            {/* Header */}
            {/* Header Section */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10">
                <div>
                    <h1 className="text-3xl lg:text-4xl font-black text-slate-900 tracking-tight mb-2 flex items-center gap-4">
                        <div className="p-2.5 bg-indigo-600 text-white rounded-2xl shadow-lg shadow-indigo-200">
                            <RiBusLine size={28} />
                        </div>
                        Transit Nexus
                    </h1>
                    <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] items-center flex gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></div>
                        Route Intelligence & Commute Management
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                {/* Left: Request Form */}
                <div className="lg:col-span-2 space-y-8">
                    <div className="bg-white rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100 p-8 sm:p-12 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-50/50 rounded-full -mr-32 -mt-32 blur-3xl group-hover:bg-indigo-100/50 transition-all duration-1000"></div>
                        <h2 className="text-2xl font-black text-slate-900 mb-10 flex items-center gap-4 relative z-10">
                            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl border border-indigo-100 shadow-sm">
                                <RiTicketLine size={24} />
                            </div>
                            Access Permit Request
                        </h2>

                        <form onSubmit={handleSubmit} className="space-y-8 relative z-10">
                            {/* Route Selection */}
                            <div>
                                <label className="block text-[10px] uppercase tracking-[0.2em] font-black text-slate-400 mb-4 ml-1">Select Transit Corridors</label>
                                <div className="relative group/select">
                                    <select
                                        className="w-full p-5 pl-14 bg-slate-50 border border-slate-100 rounded-[1.8rem] text-slate-900 focus:ring-4 focus:ring-indigo-100 outline-none appearance-none font-bold transition-all hover:bg-white hover:border-indigo-100 shadow-sm"
                                        onChange={handleRouteSelect}
                                        value={selectedRoute?.routeId || ''}
                                        required
                                    >
                                        <option value="" className="text-gray-900">-- Select Available Route --</option>
                                        {routes.map(r => (
                                            <option key={r.routeId} value={r.routeId} className="text-gray-900">
                                                {r.routeName} ({r.startPoint} - {r.endPoint})
                                            </option>
                                        ))}
                                    </select>
                                    <RiMapPinLine className="absolute left-5 top-5.5 text-indigo-400 group-hover/select:scale-110 transition-transform" size={20} />
                                    <div className="absolute right-5 top-5.5 text-slate-300 pointer-events-none group-hover/select:text-indigo-600 group-hover/select:translate-y-0.5 transition-all">
                                        <RiBusLine size={24} />
                                    </div>
                                </div>
                            </div>

                            {/* Stage Selection */}
                            {selectedRoute && (
                                <div className="animate-in fade-in slide-in-from-bottom-6 duration-700">
                                    <label className="block text-[10px] uppercase tracking-[0.2em] font-black text-slate-400 mb-5 ml-1">Select Boarding Terminal (Stage)</label>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-h-80 overflow-y-auto overflow-x-hidden custom-scrollbar pr-3">
                                        {selectedRoute.stages.map((stage, idx) => (
                                            <div
                                                key={idx}
                                                onClick={() => setSelectedStage(stage)}
                                                className={`group/stage p-6 rounded-[2rem] border-2 cursor-pointer transition-all duration-500 flex justify-between items-center relative overflow-hidden h-full ${selectedStage?.stageName === stage.stageName
                                                    ? 'bg-indigo-600 border-indigo-600 shadow-2xl shadow-indigo-200 scale-[1.02]'
                                                    : 'bg-slate-50 border-slate-100 hover:border-indigo-100 hover:bg-white hover:shadow-lg'
                                                    }`}
                                            >
                                                <div className="relative z-10 text-left">
                                                    <p className={`font-black text-[17px] tracking-tight transition-colors mb-1 ${selectedStage?.stageName === stage.stageName ? 'text-white' : 'text-slate-800'}`}>{stage.stageName}</p>
                                                    <p className={`text-[10px] font-black uppercase tracking-widest transition-colors ${selectedStage?.stageName === stage.stageName ? 'text-indigo-200' : 'text-slate-400'}`}>{stage.distanceFromStart} KM Distance</p>
                                                </div>
                                                <div className="relative z-10 text-right">
                                                    <span className={`block text-xl font-black transition-colors ${selectedStage?.stageName === stage.stageName ? 'text-white' : 'text-indigo-600'}`}>₹{stage.fare}</span>
                                                </div>
                                                {selectedStage?.stageName === stage.stageName && (
                                                    <div className="absolute right-2 top-2">
                                                        <div className="w-6 h-6 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white border border-white/20">
                                                            <RiCheckboxCircleFill size={14} />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Summary & Action */}
                            {selectedRoute && selectedStage && (
                                <div className="bg-slate-900 rounded-[2rem] p-8 flex flex-col sm:flex-row justify-between items-center gap-8 animate-in zoom-in-95 duration-700 shadow-2xl relative overflow-hidden group/footer">
                                    <div className="absolute top-0 right-0 w-40 h-40 bg-indigo-500/10 rounded-full -mr-20 -mt-20 blur-3xl group-hover/footer:bg-indigo-500/20 transition-all"></div>
                                    <div className="text-center sm:text-left relative z-10">
                                        <p className="text-[10px] text-indigo-400 font-black uppercase tracking-[0.3em] mb-2">Cycle Assessment</p>
                                        <div className="flex items-baseline gap-2">
                                            <span className="text-4xl font-black text-white tracking-tighter">₹{selectedStage.fare}</span>
                                            <span className="text-xs font-bold text-slate-500 italic">Net Amount</span>
                                        </div>
                                    </div>
                                    <button
                                        type="submit"
                                        disabled={submitting}
                                        className="w-full sm:w-auto px-12 py-5 bg-indigo-600 text-white font-black uppercase tracking-widest text-[11px] rounded-2xl shadow-lg shadow-indigo-600/20 hover:bg-indigo-500 hover:-translate-y-1 transition-all active:scale-95 disabled:opacity-50 relative z-10"
                                    >
                                        {submitting ? 'Processing Signal...' : 'Initiate Subscription'}
                                    </button>
                                </div>
                            )}
                        </form>
                    </div>

                    {/* Route Details Card */}
                    {selectedRoute && (
                        <div className="bg-white rounded-[2.5rem] shadow-xl shadow-slate-200/50 p-10 animate-in fade-in zoom-in-95 duration-1000 border border-slate-100 relative overflow-hidden">
                            <h3 className="text-2xl font-black mb-10 text-slate-900 tracking-tight flex items-center gap-4">
                                <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl border border-indigo-100">
                                    <RiBusLine />
                                </div>
                                Corridor Intelligence
                            </h3>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-10">
                                <div className="space-y-2">
                                    <p className="text-slate-400 text-[10px] uppercase font-black tracking-widest">Entry Point</p>
                                    <p className="font-black text-xl text-slate-800 tracking-tight">{selectedRoute.startPoint}</p>
                                </div>
                                <div className="space-y-2">
                                    <p className="text-slate-400 text-[10px] uppercase font-black tracking-widest">Destination</p>
                                    <p className="font-black text-xl text-slate-800 tracking-tight">{selectedRoute.endPoint}</p>
                                </div>
                                <div className="space-y-2">
                                    <p className="text-slate-400 text-[10px] uppercase font-black tracking-widest">Transit Time</p>
                                    <p className="font-black text-xl text-slate-800 tracking-tight flex items-center gap-2">
                                        <RiTimeLine className="text-indigo-500" />
                                        {selectedRoute.estimatedTime || 'N/A'}
                                    </p>
                                </div>
                                <div className="space-y-2">
                                    <p className="text-slate-400 text-[10px] uppercase font-black tracking-widest">Total Span</p>
                                    <p className="font-black text-xl text-indigo-600 tracking-tight underline decoration-indigo-200 underline-offset-8">{selectedRoute.totalDistance} KM</p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Right: History */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col h-full">
                    <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <RiHistoryLine className="text-purple-500" /> Request History
                    </h2>

                    <div className="flex-1 overflow-y-auto space-y-4 pr-1 custom-scrollbar">
                        {loading ? (
                            <p className="text-center text-gray-400 py-10">Loading...</p>
                        ) : requests.length === 0 ? (
                            <div className="text-center py-10">
                                <div className="bg-gray-50 rounded-full h-16 w-16 flex items-center justify-center mx-auto mb-3 text-gray-300">
                                    <RiBusLine size={32} />
                                </div>
                                <p className="text-gray-500">No requests yet.</p>
                            </div>
                        ) : (
                            requests.map((req) =>
                                req.status === 'approved' ? (
                                    /* Bus Pass Card - shown when request is approved */
                                    <div
                                        key={req.id}
                                        className="relative overflow-hidden rounded-2xl border-2 border-emerald-500/40 bg-emerald-50 shadow-md shadow-emerald-100"
                                    >
                                        {/* Decorative strip */}
                                        <div className="h-2 bg-emerald-600" />
                                        <div className="p-4">
                                            {/* Header: BUS PASS + Valid badge */}
                                            <div className="flex items-center justify-between mb-4">
                                                <div className="flex items-center gap-2">
                                                    <RiBusLine className="text-emerald-600" size={24} />
                                                    <span className="text-lg font-black uppercase tracking-widest text-emerald-800">Bus Pass</span>
                                                </div>
                                                <div className="flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1">
                                                    <RiCheckboxCircleFill className="text-emerald-600" size={16} />
                                                    <span className="text-xs font-bold uppercase text-emerald-700">Valid</span>
                                                </div>
                                            </div>
                                            {/* Student & route info */}
                                            <div className="space-y-2 text-sm">
                                                <div className="flex justify-between border-b border-emerald-100 pb-2">
                                                    <span className="text-gray-500">Name</span>
                                                    <span className="font-semibold text-gray-900">{req.student_name || '–'}</span>
                                                </div>
                                                <div className="flex justify-between border-b border-emerald-100 pb-2">
                                                    <span className="text-gray-500">Admission No.</span>
                                                    <span className="font-mono font-semibold text-gray-900">{req.admission_number || '–'}</span>
                                                </div>
                                                <div className="flex justify-between border-b border-emerald-100 pb-2">
                                                    <span className="text-gray-500">Route</span>
                                                    <span className="font-semibold text-gray-900 line-clamp-1">{req.route_name || '–'}</span>
                                                </div>
                                                <div className="flex justify-between border-b border-emerald-100 pb-2">
                                                    <span className="text-gray-500">Boarding</span>
                                                    <span className="font-semibold text-gray-900">{req.stage_name || '–'}</span>
                                                </div>
                                                {(req.semester_start_date || req.semester_end_date) && (
                                                    <div className="flex justify-between border-b border-emerald-100 pb-2">
                                                        <span className="text-gray-500">Valid till</span>
                                                        <span className="font-semibold text-gray-900">
                                                            {req.semester_end_date
                                                                ? new Date(req.semester_end_date).toLocaleDateString()
                                                                : req.semester_start_date
                                                                    ? new Date(req.semester_start_date).toLocaleDateString()
                                                                    : '–'}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                            {/* Footer: fare & request date */}
                                            <div className="mt-4 flex items-center justify-between rounded-lg bg-white/80 px-3 py-2">
                                                <span className="text-xs text-gray-500">Fare paid ₹{req.fare}</span>
                                                <span className="text-xs text-gray-500">From {new Date(req.request_date).toLocaleDateString()}</span>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    /* Regular request card for pending/rejected */
                                    <div key={req.id} className="p-4 rounded-xl bg-gray-50 border border-gray-100 hover:shadow-md transition-all">
                                        <div className="flex justify-between items-start mb-2">
                                            <h4 className="font-bold text-gray-800 line-clamp-1">{req.route_name}</h4>
                                            {getStatusBadge(req.status)}
                                        </div>
                                        <p className="text-sm text-gray-600 mb-1">Stage: <span className="font-medium">{req.stage_name}</span></p>
                                        {(req.year_of_study != null || req.semester_number != null) && (
                                            <p className="text-xs text-gray-500 mb-1">
                                                Year {req.year_of_study ?? '–'}, Sem {req.semester_number ?? '–'}
                                                {req.semester_start_date && req.semester_end_date && (
                                                    <span className="ml-1">
                                                        ({new Date(req.semester_start_date).toLocaleDateString()} – {new Date(req.semester_end_date).toLocaleDateString()})
                                                    </span>
                                                )}
                                            </p>
                                        )}
                                        <div className="flex justify-between items-center mt-3">
                                            <span className="text-xs text-gray-400">{new Date(req.request_date).toLocaleDateString()}</span>
                                            <span className="font-bold text-blue-600">₹{req.fare}</span>
                                        </div>
                                    </div>
                                )
                            )
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
};

export default Transport;
