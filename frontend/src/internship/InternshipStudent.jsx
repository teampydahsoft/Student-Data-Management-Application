import React, { useState, useEffect } from 'react';
import api from '../config/api';

import { toast } from 'react-hot-toast';
import { MapPin, Navigation, CheckCircle, XCircle, Loader2, Clock, Map, Camera, RefreshCw } from 'lucide-react';

const InternshipStudent = () => {
    const [locations, setLocations] = useState([]);
    const [selectedLocation, setSelectedLocation] = useState('');
    const [loading, setLoading] = useState(false);
    const [fetchingLoc, setFetchingLoc] = useState(false);
    const [status, setStatus] = useState(null); // NOT_STARTED, CHECKED_IN, COMPLETED, UNKNOWN
    const [todayRecord, setTodayRecord] = useState(null);
    const [assignedInternship, setAssignedInternship] = useState(null);
    const [showPhotoModal, setShowPhotoModal] = useState(false);
    const [capturedImage, setCapturedImage] = useState(null);
    const [pendingLocationData, setPendingLocationData] = useState(null);
    const [showLocationModal, setShowLocationModal] = useState(false);
    const [attendanceWindows, setAttendanceWindows] = useState(null);

    const parseTimeToMinutes = (timeStr) => {
        if (!timeStr) return null;
        const [hours, minutes] = timeStr.split(':').map(Number);
        if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
        return hours * 60 + minutes;
    };

    const isWithinServerWindow = (window) => {
        if (!window || !attendanceWindows?.serverTimeIST) return false;
        const nowMinutes = parseTimeToMinutes(attendanceWindows.serverTimeIST);
        const startMinutes = parseTimeToMinutes(window.start);
        const endMinutes = parseTimeToMinutes(window.end);
        if (nowMinutes == null || startMinutes == null || endMinutes == null) return false;
        return nowMinutes >= startMinutes && nowMinutes <= endMinutes;
    };

    const activeMarkingWindow = status === 'CHECKED_IN'
        ? attendanceWindows?.checkOutWindow
        : attendanceWindows?.checkInWindow;

    const canMarkAttendance = Boolean(activeMarkingWindow) && isWithinServerWindow(activeMarkingWindow);

    const markingWindowMessage = activeMarkingWindow
        ? `${status === 'CHECKED_IN' ? 'Check-out' : 'Check-in'} is allowed between ${activeMarkingWindow.start} and ${activeMarkingWindow.end} IST`
        : null;

    // Initial Load
    useEffect(() => {
        fetchLocations();
        fetchStatus();
        fetchMyAssignment();
    }, []);

    // Refresh server IST clock every minute so the button state stays accurate
    useEffect(() => {
        const interval = setInterval(() => {
            fetchStatus();
            fetchMyAssignment();
        }, 60 * 1000);
        return () => clearInterval(interval);
    }, []);

    const fetchMyAssignment = async () => {
        try {
            const res = await api.get('/internship/my-assignment');
            if (res.data.success && res.data.assignment) {
                setAssignedInternship(res.data.assignment);
                setSelectedLocation(res.data.assignment.internship_id);
            }
            if (res.data.attendanceWindows) {
                setAttendanceWindows(res.data.attendanceWindows);
            }
        } catch (error) {
            console.error('Failed to fetch assignment', error);
        }
    };

    const fetchLocations = async () => {
        try {
            const res = await api.get('/internship/list');
            if (res.data.success) {
                setLocations(res.data.data);
            }
        } catch (error) {
            console.error(error);
        }
    };

    const fetchStatus = async () => {
        try {
            const res = await api.get('/internship/status');
            if (res.data.success) {
                setStatus(res.data.status);
                if (res.data.attendanceWindows) {
                    setAttendanceWindows(res.data.attendanceWindows);
                }
                if (res.data.data) {
                    setTodayRecord(res.data.data);
                    setSelectedLocation(res.data.data.internshipId._id);
                }
            }
        } catch (error) {
            console.error(error);
        }
    };

    // Device Fingerprinting
    const generateDeviceFingerprint = async () => {
        try {
            const components = [
                navigator.userAgent,
                navigator.language,
                new Date().getTimezoneOffset(),
                window.screen.width + 'x' + window.screen.height,
                window.screen.colorDepth,
                navigator.hardwareConcurrency || 'unknown',
                navigator.deviceMemory || 'unknown',
                // Canvas Fingerprinting (Basic)
                (() => {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    ctx.textBaseline = "top";
                    ctx.font = "14px 'Arial'";
                    ctx.fillStyle = "#f60";
                    ctx.fillRect(125, 1, 62, 20);
                    ctx.fillStyle = "#069";
                    ctx.fillText("Internship", 2, 15);
                    ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
                    ctx.fillText("Attendance", 4, 17);
                    return canvas.toDataURL();
                })()
            ];

            // Simple hash function (DJB2)
            const str = components.join('|||');
            let hash = 5381;
            for (let i = 0; i < str.length; i++) {
                hash = ((hash << 5) + hash) + str.charCodeAt(i); /* hash * 33 + c */
            }
            return (hash >>> 0).toString(16); // Convert to unsigned hex
        } catch (e) {
            console.error("Fingerprint error", e);
            return 'unknown-' + Date.now();
        }
    };


    const handleRequestLocation = () => {
        if (!selectedLocation && status === 'NOT_STARTED') {
            toast.error('Please select an internship location first.');
            return;
        }
        if (!canMarkAttendance) {
            toast.error(
                markingWindowMessage
                    ? `${markingWindowMessage}. Current server time: ${attendanceWindows?.serverTimeIST || '—'} IST.`
                    : 'Attendance marking is not available at this time.'
            );
            return;
        }
        setShowLocationModal(true);
    };

    const handleConfirmLocation = () => {
        setShowLocationModal(false);
        if (!navigator.geolocation) {
            toast.error('Geolocation is not supported by your browser.');
            return;
        }

        setFetchingLoc(true);
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const { latitude, longitude, accuracy } = position.coords;
                setFetchingLoc(false);
                submitAttendance(latitude, longitude, accuracy);
            },
            (error) => {
                setFetchingLoc(false);
                if (error.code === 1) {
                    toast.error('Location permission denied. Please allow access in browser settings.');
                } else {
                    toast.error('Unable to retrieve location. Ensure GPS is on.');
                }
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    };

    const submitAttendance = async (lat, long, accuracy, image = null) => {
        try {
            setLoading(true);
            const deviceFingerprint = await generateDeviceFingerprint();
            const payload = {
                internshipId: selectedLocation || todayRecord?.internshipId?._id,
                latitude: lat,
                longitude: long,
                accuracy: accuracy,
                image: image,
                deviceFingerprint: deviceFingerprint
            };

            const res = await api.post('/internship/mark-attendance', payload);

            if (res.data.success) {
                toast.success(res.data.message);
                fetchStatus(); // Refresh status
                setShowPhotoModal(false);
                setCapturedImage(null);
                setPendingLocationData(null);
            }
        } catch (error) {
            const data = error.response?.data;
            const msg = data?.message || 'Attendance failed.';

            if (data?.requiresPhoto) {
                toast.error(msg);
                setPendingLocationData({ lat, long, accuracy });
                setShowPhotoModal(true);
            } else {
                toast.error(msg);
            }
        } finally {
            setLoading(false);
        }
    };

    const [cameraStream, setCameraStream] = useState(null);
    const videoRef = React.useRef(null);
    const canvasRef = React.useRef(null);

    const startCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' },
                audio: false
            });
            setCameraStream(stream);
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }
        } catch (error) {
            console.error('Camera Error:', error);
            toast.error('Unable to access camera. Please allow permissions.');
        }
    };

    const stopCamera = () => {
        if (cameraStream) {
            cameraStream.getTracks().forEach(track => track.stop());
            setCameraStream(null);
        }
    };

    useEffect(() => {
        if (showPhotoModal && !capturedImage) {
            startCamera();
        } else {
            stopCamera();
        }
        return () => stopCamera();
    }, [showPhotoModal, capturedImage]);

    const capturePhoto = () => {
        if (videoRef.current && canvasRef.current) {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            const context = canvas.getContext('2d');

            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            context.drawImage(video, 0, 0, canvas.width, canvas.height);

            const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
            setCapturedImage(dataUrl);
            stopCamera();
        }
    };

    const retakePhoto = () => {
        setCapturedImage(null);
        // Effect will restart camera
    };


    const handlePhotoSubmit = () => {
        if (!capturedImage) {
            toast.error('Please capture or upload a photo.');
            return;
        }
        if (!pendingLocationData) return;
        submitAttendance(
            pendingLocationData.lat,
            pendingLocationData.long,
            pendingLocationData.accuracy,
            capturedImage
        );
    };

    // UI Components for States
    const renderStatusCard = () => {
        if (loading || fetchingLoc) return (
            <div className="flex flex-col items-center justify-center p-8 text-center animate-pulse">
                <Loader2 className="w-12 h-12 text-indigo-500 animate-spin mb-4" />
                <h3 className="text-lg font-medium text-gray-900">
                    {fetchingLoc ? 'Acquiring GPS Signal...' : 'Verifying Location...'}
                </h3>
                <p className="text-sm text-gray-500 mt-2">Please stand still in an open area.</p>
            </div>
        );

        if (status === 'COMPLETED') {
            return (
                <div className="flex flex-col items-center justify-center p-8 text-center bg-green-50 rounded-2xl border border-green-100">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                        <CheckCircle className="w-8 h-8 text-green-600" />
                    </div>
                    <h2 className="text-2xl font-bold text-green-800">Attendance Completed</h2>
                    <p className="text-green-600 mt-2">You have successfully checked out for today.</p>
                    <div className="mt-6 w-full bg-white p-4 rounded-xl text-left shadow-sm">
                        <div className="flex justify-between py-2 border-b border-gray-100">
                            <span className="text-gray-500">Location</span>
                            <span className="font-medium">{todayRecord?.internshipId?.companyName}</span>
                        </div>
                        <div className="flex justify-between py-2 border-b border-gray-100">
                            <span className="text-gray-500">Check In</span>
                            <span className="font-medium text-indigo-700">
                                {new Date(todayRecord?.checkInTime).toLocaleTimeString()}
                            </span>
                        </div>
                        <div className="flex justify-between py-2">
                            <span className="text-gray-500">Check Out</span>
                            <span className="font-medium text-green-700">
                                {new Date(todayRecord?.checkOutTime).toLocaleTimeString()}
                            </span>
                        </div>
                    </div>
                </div>
            );
        }

        if (status === 'CHECKED_IN') {
            return (
                <div className="flex flex-col items-center justify-center p-8 text-center bg-blue-50 rounded-2xl border border-blue-100">
                    <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4 animate-pulse">
                        <Clock className="w-8 h-8 text-blue-600" />
                    </div>
                    <h2 className="text-2xl font-bold text-blue-800">Currently Checked In</h2>
                    <p className="text-blue-600 mt-2">Don't forget to check out before leaving.</p>

                    <div className="mt-4 mb-6">
                        <span className="inline-block px-3 py-1 bg-white rounded-full text-sm font-medium text-blue-600 shadow-sm">
                            Since {new Date(todayRecord?.checkInTime).toLocaleTimeString()}
                        </span>
                    </div>

                    <button
                        onClick={handleRequestLocation}
                        disabled={loading || fetchingLoc || !canMarkAttendance}
                        className={`w-full py-3 font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 ${
                            canMarkAttendance
                                ? 'bg-red-600 hover:bg-red-700 active:bg-red-800 text-white shadow-red-200'
                                : 'bg-gray-300 text-gray-500 cursor-not-allowed shadow-none'
                        }`}
                    >
                        <Navigation className="w-5 h-5" /> Mark Check Out
                    </button>
                    {!canMarkAttendance && markingWindowMessage && (
                        <p className="text-center text-xs text-amber-600 mt-3 px-4">
                            {markingWindowMessage}. Server time: {attendanceWindows?.serverTimeIST} IST.
                        </p>
                    )}
                </div>
            );
        }

        // Default: NOT_STARTED
        return (
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Select Internship Location</label>
                    <select
                        value={selectedLocation}
                        onChange={(e) => setSelectedLocation(e.target.value)}
                        disabled={!!assignedInternship}
                        className={`w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all ${assignedInternship ? 'bg-indigo-50 border-indigo-200 text-indigo-700 cursor-not-allowed' : ''}`}
                    >
                        {assignedInternship ? (
                            <option value={assignedInternship.internship_id}>
                                {assignedInternship.company_name} (Assigned)
                            </option>
                        ) : (
                            <>
                                <option value="">-- Choose Location --</option>
                                {locations.map(loc => (
                                    <option key={loc._id} value={loc._id}>{loc.companyName}</option>
                                ))}
                            </>
                        )}
                    </select>
                </div>

                <button
                    onClick={handleRequestLocation}
                    disabled={loading || fetchingLoc || !selectedLocation || !canMarkAttendance}
                    className={`w-full py-4 text-white font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2
                        ${!selectedLocation || !canMarkAttendance
                            ? 'bg-gray-300 cursor-not-allowed text-gray-500 shadow-none'
                            : 'bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 shadow-indigo-200 hover:shadow-xl hover:-translate-y-1'}`}
                >
                    <MapPin className="w-5 h-5" /> Mark Check In
                </button>

                {markingWindowMessage && (
                    <p className={`text-center text-xs mt-4 px-4 ${canMarkAttendance ? 'text-gray-500' : 'text-amber-600'}`}>
                        {markingWindowMessage}. Server time: {attendanceWindows?.serverTimeIST || '—'} IST.
                    </p>
                )}

                <p className="text-center text-xs text-gray-400 mt-2 px-4">
                    Requires GPS permission. Accuracy must be within 100m.
                </p>
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-gray-50 pb-20">
            {/* Header */}
            <div className="bg-white px-6 py-5 shadow-sm sticky top-0 z-10">
                <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                    <Map className="w-6 h-6 text-indigo-600" /> Internship Attendance
                </h1>
            </div>

            <div className="p-4 max-w-lg mx-auto mt-4">
                {renderStatusCard()}

                {/* Location Permission Modal */}
                {showLocationModal && (
                    <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center p-4 z-50">
                        <div className="bg-white rounded-2xl p-6 w-full max-w-sm text-center">
                            <div className="mx-auto w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mb-4">
                                <MapPin className="w-8 h-8 text-indigo-600" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 mb-2">Location Required</h3>
                            <p className="text-gray-500 mb-6">
                                We need to access your location to verify you are at the internship site.
                                Please click "Allow" when prompted by your browser.
                            </p>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowLocationModal(false)}
                                    className="flex-1 py-3 text-gray-600 font-medium hover:bg-gray-100 rounded-xl"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleConfirmLocation}
                                    className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-indigo-200 shadow-lg"
                                >
                                    Allow Access
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Photo Verification Modal */}
                {showPhotoModal && (
                    <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center p-4 z-50">
                        <div className="bg-white rounded-2xl p-4 w-full max-w-sm flex flex-col max-h-[90vh]">
                            <h3 className="text-lg font-bold text-gray-900 mb-2">Detailed Verification Required</h3>
                            <p className="text-sm text-gray-500 mb-4">
                                Please take a clear photo of your surroundings to verify your location.
                            </p>

                            <div className="flex-1 bg-black rounded-xl overflow-hidden relative min-h-[300px] flex items-center justify-center">
                                {!capturedImage ? (
                                    <>
                                        <video
                                            ref={videoRef}
                                            autoPlay
                                            playsInline
                                            muted
                                            className="w-full h-full object-cover"
                                        />
                                        <canvas ref={canvasRef} className="hidden" />
                                        <div className="absolute bottom-4 left-0 right-0 flex justify-center">
                                            <button
                                                onClick={capturePhoto}
                                                className="w-16 h-16 bg-white rounded-full border-4 border-gray-300 flex items-center justify-center shadow-lg active:scale-95 transition-transform"
                                            >
                                                <div className="w-12 h-12 bg-red-600 rounded-full"></div>
                                            </button>
                                        </div>
                                    </>
                                ) : (
                                    <img src={capturedImage} alt="Captured" className="w-full h-full object-cover" />
                                )}
                            </div>

                            <div className="mt-4 flex gap-3">
                                {capturedImage ? (
                                    <>
                                        <button
                                            onClick={retakePhoto}
                                            className="flex-1 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 flex items-center justify-center gap-2"
                                        >
                                            <RefreshCw className="w-5 h-5" /> Retake
                                        </button>
                                        <button
                                            onClick={handlePhotoSubmit}
                                            disabled={loading}
                                            className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 flex items-center justify-center gap-2"
                                        >
                                            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
                                            Submit
                                        </button>
                                    </>
                                ) : (
                                    <button
                                        onClick={() => { setShowPhotoModal(false); stopCamera(); }}
                                        className="w-full py-3 text-gray-500 font-medium hover:text-gray-900"
                                    >
                                        Cancel
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default InternshipStudent;
