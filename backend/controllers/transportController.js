const mongoose = require('mongoose');
const { masterPool } = require('../config/database');
const transportConnection = require('../config/transportDb');
const { getISTDateString } = require('../utils/dateUtils');

// Import Schemas using the new connection
const RouteModelInfo = require('../MongoDb-Transport/Route');
const BusModelInfo = require('../MongoDb-Transport/Bus');

// Re-compile models for Transport DB Connection
const Route = transportConnection.model('Route', RouteModelInfo.schema);
const Bus = transportConnection.model('Bus', BusModelInfo.schema);

// Strict Read-Only Mongoose Model for transport_requests in pydah_transport
const TransportRequest = require('../MongoDb-Transport/TransportRequest');

const gpsFinalDestinationSchema = new mongoose.Schema({
    campus: Number,
    name: String,
    latitude: Number,
    longitude: Number,
    radius: Number,
    isActive: Boolean
}, { collection: 'gpsfinaldestinations', strict: false });

const GpsFinalDestination = transportConnection.model('GpsFinalDestination', gpsFinalDestinationSchema);

exports.getAllRoutes = async (req, res) => {
    try {
        const routes = await Route.find({}).sort({ routeName: 1 }).lean();
        res.json({ success: true, data: routes });
    } catch (error) {
        console.error('Error fetching routes:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch routes' });
    }
};

exports.getBuses = async (req, res) => {
    try {
        const buses = await Bus.find({ status: 'Active' }).lean();
        res.json({ success: true, data: buses });
    } catch (error) {
        console.error('Error fetching buses:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch buses' });
    }
};

/**
 * Fetch resolved admission number from req.user or database
 */
async function resolveAdmissionNumber(req) {
    if (req.query && req.query.admission_number) {
        return String(req.query.admission_number).trim();
    }
    if (req.user && req.user.admission_number) {
        return String(req.user.admission_number).trim();
    }
    if (req.user && req.user.id) {
        const [students] = await masterPool.execute(
            'SELECT admission_number FROM students WHERE id = ? LIMIT 1',
            [req.user.id]
        );
        if (students.length > 0 && students[0].admission_number) {
            return String(students[0].admission_number).trim();
        }
    }
    return null;
}

/**
 * Enrich transport request items with Route ID, Stop ID, Stop Name, Bus, and active state
 */
async function enrichTransportRequests(rawRequests) {
    const enriched = [];

    // Cache routes, buses, and destination in memory during request cycle
    const routeCache = new Map();
    const busCache = new Map();
    let campusDestination = null;
    try {
        campusDestination = await GpsFinalDestination.findOne({ isActive: true }).lean();
    } catch (e) {
        // Fallback default for Pydah College campus
        campusDestination = { name: 'PYDAH COLLEGE', latitude: 16.839036, longitude: 82.225011 };
    }
    if (!campusDestination) {
        campusDestination = { name: 'PYDAH COLLEGE', latitude: 16.839036, longitude: 82.225011 };
    }

    for (const reqItem of rawRequests) {
        const routeId = reqItem.route_id;
        const busId = reqItem.bus_id;

        // 1. Resolve Route & Stop ID
        let routeDoc = null;
        if (routeId) {
            if (routeCache.has(routeId)) {
                routeDoc = routeCache.get(routeId);
            } else {
                routeDoc = await Route.findOne({
                    $or: [{ routeId: routeId }, { route_id: routeId }, { routeId: String(routeId) }]
                }).lean();
                routeCache.set(routeId, routeDoc);
            }
        }

        let matchedStop = null;
        if (routeDoc && Array.isArray(routeDoc.stages)) {
            const targetStageName = (reqItem.stage_name || '').trim().toLowerCase();
            const foundStage = routeDoc.stages.find(
                s => s.stageName && s.stageName.trim().toLowerCase() === targetStageName
            );
            if (foundStage) {
                matchedStop = {
                    stopId: String(foundStage._id),
                    stageName: foundStage.stageName,
                    distanceFromStart: foundStage.distanceFromStart,
                    distanceToDestination: foundStage.distanceToDestination != null ? Number(foundStage.distanceToDestination) : null,
                    fare: foundStage.fare,
                    latitude: foundStage.latitude != null ? Number(foundStage.latitude) : (foundStage.coordinates?.latitude || null),
                    longitude: foundStage.longitude != null ? Number(foundStage.longitude) : (foundStage.coordinates?.longitude || null),
                    radius: foundStage.radius || 100,
                    coordinates: foundStage.coordinates || null
                };
            }
        }

        // 2. Resolve Bus Details
        let busDoc = null;
        if (busId) {
            if (busCache.has(busId)) {
                busDoc = busCache.get(busId);
            } else {
                busDoc = await Bus.findOne({
                    $or: [{ busNumber: busId }, { bus_id: busId }, { registrationNumber: busId }]
                }).lean();
                busCache.set(busId, busDoc);
            }
        }

        // 3. Compute Pass Active State
        const statusLower = String(reqItem.status || '').trim().toLowerCase();
        const isNotInterested = reqItem.not_interested === true || reqItem.not_interested === 'true' || reqItem.not_interested === 1;
        const isCancelled = Boolean(reqItem.cancelled_at);
        const isActivePass = (statusLower === 'approved' || statusLower === 'active') && !isCancelled && !isNotInterested;

        // Ensure stages array includes all route stages and ends at campus destination
        let stagesList = routeDoc?.stages ? [...routeDoc.stages] : [];
        if (campusDestination && campusDestination.latitude && campusDestination.longitude) {
            const alreadyHasCampus = stagesList.some(
                s => (s.stageName || '').toUpperCase().includes('PYDAH') ||
                     (Math.abs(Number(s.latitude) - campusDestination.latitude) < 0.005 &&
                      Math.abs(Number(s.longitude) - campusDestination.longitude) < 0.005)
            );
            if (!alreadyHasCampus) {
                stagesList.push({
                    _id: 'pydah_campus_dest',
                    stageName: campusDestination.name || 'PYDAH COLLEGE',
                    latitude: campusDestination.latitude,
                    longitude: campusDestination.longitude,
                    distanceFromStart: routeDoc?.totalDistance || null,
                    distanceToDestination: 0,
                    radius: campusDestination.radius || 200,
                    isCampusDestination: true
                });
            }
        }

        enriched.push({
            requestId: reqItem.id || null,
            mongoId: String(reqItem._id),
            applicationNumber: reqItem.application_number || null,
            studentName: reqItem.student_name,
            admissionNumber: String(reqItem.admission_number),
            academicYear: reqItem.academic_year || null,
            routeId: reqItem.route_id,
            routeName: reqItem.route_name || (routeDoc ? routeDoc.routeName : null),
            stopId: matchedStop ? matchedStop.stopId : null,
            stopName: reqItem.stage_name,
            stopDetails: matchedStop,
            busId: reqItem.bus_id || null,
            busDetails: busDoc ? {
                busNumber: busDoc.busNumber,
                capacity: busDoc.capacity,
                status: busDoc.status,
                driverName: busDoc.driverName || null,
                driverPhone: busDoc.driverPhone || null,
                attendantName: busDoc.attendantName || null
            } : null,
            routeDetails: routeDoc ? {
                routeId: routeDoc.routeId,
                routeName: routeDoc.routeName,
                startPoint: routeDoc.startPoint,
                endPoint: routeDoc.endPoint,
                totalDistance: routeDoc.totalDistance,
                estimatedTime: routeDoc.estimatedTime || null,
                destination: {
                    name: campusDestination.name || 'PYDAH COLLEGE',
                    latitude: campusDestination.latitude,
                    longitude: campusDestination.longitude
                },
                stages: stagesList
            } : null,
            fare: reqItem.fare != null ? Number(reqItem.fare) : 0,
            status: reqItem.status,
            physicalCardQr: reqItem.physical_card_qr || null,
            isActivePass: isActivePass,
            cancelledAt: reqItem.cancelled_at || null,
            notInterested: reqItem.not_interested || null,
            createdAt: reqItem.created_at || reqItem.createdAt || null
        });
    }

    return enriched;
}

/**
 * GET /transport/my-details
 * Directly queries the read-only pydah_transport MongoDB database by student's admission number.
 * Returns active pass details, stop ID, route ID, request ID, bus details, and all requests.
 */
exports.getMyTransportDetails = async (req, res) => {
    try {
        const admissionNumber = await resolveAdmissionNumber(req);

        if (!admissionNumber) {
            return res.json({
                success: true,
                hasTransportAccess: false,
                hasActivePass: false,
                activePass: null,
                requests: []
            });
        }

        // Query pydah_transport MongoDB collection transport_requests
        const rawRequests = await TransportRequest.find({
            $or: [
                { admission_number: admissionNumber },
                { admission_number: Number(admissionNumber) },
                { admissionNumber: admissionNumber }
            ]
        }).sort({ id: -1, _id: -1 }).lean();

        if (rawRequests.length === 0) {
            return res.json({
                success: true,
                hasTransportAccess: false,
                hasActivePass: false,
                activePass: null,
                requests: []
            });
        }

        const enrichedRequests = await enrichTransportRequests(rawRequests);
        const activePass = enrichedRequests.find(r => r.isActivePass) || null;

        // Fetch initial live GPS coordinates if student has an active bus/route
        let liveLocation = null;
        if (activePass && (activePass.busId || activePass.routeId)) {
            try {
                const targetKey = encodeURIComponent(String(activePass.busId || activePass.routeId).trim());
                const gpsRes = await fetch(`https://transport.pydah.edu.in/api/gps/live-location/${targetKey}`, {
                    signal: AbortSignal.timeout(3500)
                });
                if (gpsRes.ok) {
                    const gpsJson = await gpsRes.json();
                    if (gpsJson.success && gpsJson.data) {
                        liveLocation = gpsJson.data;
                    }
                }
            } catch (e) {
                // Silently fallback if external GPS service takes longer
            }
        }

        res.json({
            success: true,
            hasTransportAccess: true,
            hasActivePass: Boolean(activePass),
            activePass: activePass,
            liveLocation: liveLocation,
            requests: enrichedRequests
        });
    } catch (error) {
        console.error('Error fetching transport details from MongoDB:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch transport details' });
    }
};

/**
 * GET /api/gps/live-location/:busNumber? OR /api/gps/live-location?routeId=...
 * Proxies real-time GPS telemetry from Pydah Transport Live GPS Tracking API
 * Supports:
 * - Endpoint 1: Specific vehicle / route live location (/live-location/:busNumber OR ?busNumber=...)
 * - Endpoint 2: All active buses live locations (/live-location OR ?routeId=...)
 */
exports.getBusLiveLocation = async (req, res) => {
    try {
        let busNumber = req.params.busNumber || req.query.busNumber;
        const routeId = req.query.routeId;

        // Fallback to active pass for authenticated student if no specific vehicle/route query requested
        if (!busNumber && !routeId && req.user && req.query.fleet !== 'true') {
            const admissionNumber = await resolveAdmissionNumber(req);
            if (admissionNumber) {
                const latestReq = await TransportRequest.findOne({
                    $or: [
                        { admission_number: admissionNumber },
                        { admission_number: Number(admissionNumber) },
                        { admissionNumber: admissionNumber }
                    ],
                    status: { $in: ['approved', 'active', 'Active'] }
                }).sort({ id: -1, _id: -1 }).lean();

                if (latestReq) {
                    busNumber = latestReq.bus_id || latestReq.route_id;
                }
            }
        }

        let gpsUrl = 'https://transport.pydah.edu.in/api/gps/live-location';

        if (busNumber) {
            const cleanKey = encodeURIComponent(String(busNumber).trim());
            gpsUrl = `https://transport.pydah.edu.in/api/gps/live-location/${cleanKey}`;
        } else if (routeId) {
            const cleanRoute = encodeURIComponent(String(routeId).trim());
            gpsUrl = `https://transport.pydah.edu.in/api/gps/live-location?routeId=${cleanRoute}`;
        }

        const response = await fetch(gpsUrl, {
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(5000)
        });

        const data = await response.json();
        return res.status(response.status).json(data);
    } catch (error) {
        console.error('Error fetching live GPS location:', error.message);
        return res.status(502).json({
            success: false,
            message: 'Failed to retrieve live GPS telemetry from vehicle tracker',
            error: error.message
        });
    }
};

/**
 * GET /transport/my-requests
 * Returns the student's requests from pydah_transport MongoDB
 */
exports.getMyTransportRequests = async (req, res) => {
    try {
        const admissionNumber = await resolveAdmissionNumber(req);

        if (!admissionNumber) {
            return res.json({ success: true, data: [] });
        }

        const rawRequests = await TransportRequest.find({
            $or: [
                { admission_number: admissionNumber },
                { admission_number: Number(admissionNumber) },
                { admissionNumber: admissionNumber }
            ]
        }).sort({ id: -1, _id: -1 }).lean();

        const enriched = await enrichTransportRequests(rawRequests);
        res.json({ success: true, data: enriched });
    } catch (error) {
        console.error('Error fetching transport requests from MongoDB:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.createTransportRequest = async (req, res) => {
    try {
        // Since the transport database is in strict read-only mode, we notify the user
        return res.status(403).json({
            success: false,
            message: 'Transport database is currently in read-only mode. Please contact the transport department for new route allocations.'
        });
    } catch (error) {
        console.error('Error in createTransportRequest:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};


