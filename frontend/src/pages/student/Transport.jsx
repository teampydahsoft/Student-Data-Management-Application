import React, { useEffect, useState, useMemo } from 'react';
import transportService from '../../services/transportService';
import useAuthStore from '../../store/authStore';
import { toast } from 'react-hot-toast';
import {
    RiBusFill,
    RiMapPin2Fill,
    RiRouteFill,
    RiCrosshair2Line,
    RiBuilding2Fill,
    RiNavigationFill,
    RiCloseLine,
    RiFocus3Line,
    RiSpeedUpLine,
    RiTimeLine,
    RiDashboard3Line,
    RiSignalTowerFill,
    RiCompass3Fill,
    RiSunLine,
    RiMoonLine,
    RiEyeLine,
    RiEyeOffLine
} from 'react-icons/ri';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle, LayersControl, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Leaflet custom marker and tooltip CSS
const customMapStyles = `
  .clean-leaflet-marker {
    background: transparent !important;
    border: none !important;
  }
  .stage-tooltip {
    background: #0f172a !important;
    color: #ffffff !important;
    font-size: 11px !important;
    font-weight: 700 !important;
    border: 1px solid rgba(255,255,255,0.2) !important;
    border-radius: 8px !important;
    padding: 4px 9px !important;
    box-shadow: 0 4px 14px rgba(0,0,0,0.35) !important;
  }
  .stage-tooltip:before {
    border-top-color: #0f172a !important;
  }
`;

// Helper component for map programmatic view adjustments
function MapViewController({ targetCoords, zoom, bounds }) {
    const map = useMap();
    useEffect(() => {
        if (bounds && bounds.length > 1) {
            map.fitBounds(bounds, { padding: [30, 30], maxZoom: 16 });
        } else if (targetCoords && targetCoords[0] && targetCoords[1]) {
            map.setView(targetCoords, zoom || 15, { animate: true });
        }
    }, [targetCoords, zoom, bounds, map]);
    return null;
}

// Scheduled Commencement Timing Constants
const MORNING_ORIGIN_START_TIME = '07:00 AM';
const EVENING_CAMPUS_START_TIME = '04:30 PM';

// Helper to add minutes to a standard time string like "07:00 AM" or "04:30 PM"
const addMinutesToTimeStr = (baseTimeStr, minutesToAdd) => {
    try {
        const parts = baseTimeStr.split(' ');
        const [hStr, mStr] = parts[0].split(':');
        let h = parseInt(hStr, 10);
        const m = parseInt(mStr, 10);
        const isPM = parts[1] === 'PM';
        if (isPM && h < 12) h += 12;
        if (!isPM && h === 12) h = 0;

        const totalMinutes = h * 60 + m + Math.round(minutesToAdd);
        let resH = Math.floor(totalMinutes / 60) % 24;
        const resM = totalMinutes % 60;
        const resAmpm = resH >= 12 ? 'PM' : 'AM';
        const formattedH = resH % 12 || 12;
        const formattedM = resM < 10 ? `0${resM}` : resM;
        return `${formattedH}:${formattedM} ${resAmpm}`;
    } catch (e) {
        return baseTimeStr;
    }
};

const Transport = () => {
    const { user } = useAuthStore();
    const [transportData, setTransportData] = useState(null);
    const [liveBusData, setLiveBusData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [mapFocus, setMapFocus] = useState('fit'); // 'fit', 'bus', 'stop', 'campus', 'custom'
    const [customFocusCoords, setCustomFocusCoords] = useState(null);
    const [lastPingTime, setLastPingTime] = useState('Just now');
    const [roadGeometry, setRoadGeometry] = useState(null);
    const [routeDuration, setRouteDuration] = useState(null);
    const [routeDistanceKm, setRouteDistanceKm] = useState(null);
    const [showFullRouteModal, setShowFullRouteModal] = useState(false);

    // Trip Direction: 'morning' (Start -> Campus) vs 'evening' (Campus -> Start)
    const [tripDirection, setTripDirection] = useState('morning');
    // Stop Times Display: false = clean minimal points (no clutter), true = show times above points
    const [showStopTimesOnMap, setShowStopTimesOnMap] = useState(false);

    // Initial fetch of transport details
    useEffect(() => {
        fetchTransportDetails();
    }, [user?.admission_number]);

    const fetchTransportDetails = async () => {
        try {
            setLoading(true);
            const res = await transportService.getMyTransportDetails(user?.admission_number);
            if (res.data && res.data.success) {
                setTransportData(res.data);
                if (res.data.liveLocation) {
                    setLiveBusData(res.data.liveLocation);
                }
            } else {
                setTransportData(null);
            }
        } catch (error) {
            console.error('Failed to load student transport details:', error);
            toast.error('Unable to fetch transport details');
        } finally {
            setLoading(false);
        }
    };

    const activePass = transportData?.activePass;
    const hasActivePass = transportData?.hasActivePass && activePass;
    const busIdentifier = activePass?.busId || activePass?.routeId;

    // Polling Live GPS Location every 3 seconds
    useEffect(() => {
        if (!hasActivePass || !busIdentifier) return;

        const pollGps = async () => {
            try {
                const res = await transportService.getLiveBusLocation(busIdentifier);
                if (res.data?.success && res.data?.data) {
                    setLiveBusData(res.data.data);
                    setLastPingTime('Just now');
                }
            } catch (err) {
                // Keep last known telemetry
            }
        };

        pollGps();
        const interval = setInterval(() => {
            pollGps();
        }, 3000);

        return () => clearInterval(interval);
    }, [hasActivePass, busIdentifier]);

    // Live ping timer counter
    useEffect(() => {
        const timer = setInterval(() => {
            setLastPingTime(prev => {
                if (prev === 'Just now') return '3s ago';
                const match = prev.match(/(\d+)s/);
                if (match) {
                    const secs = parseInt(match[1], 10) + 3;
                    return `${secs}s ago`;
                }
                return 'Just now';
            });
        }, 3000);
        return () => clearInterval(timer);
    }, []);

    // Live Speed & Ignition Status
    const liveSpeed = liveBusData?.location?.speed != null ? Number(liveBusData.location.speed) : 0;
    const isMoving = liveBusData?.location?.status === 'Moving' || liveSpeed > 0;
    const ignitionActive = Boolean(liveBusData?.location?.ignition);
    const busHeading = liveBusData?.location?.heading || 0;

    // Resolve Student Boarding Stop Coordinates
    const stopCoords = useMemo(() => {
        if (activePass?.stopDetails?.latitude && activePass?.stopDetails?.longitude) {
            return [Number(activePass.stopDetails.latitude), Number(activePass.stopDetails.longitude)];
        }
        if (activePass?.routeDetails?.stages) {
            const targetName = (activePass.stopName || '').trim().toLowerCase();
            const found = activePass.routeDetails.stages.find(
                s => s.stageName && s.stageName.trim().toLowerCase() === targetName
            );
            if (found && found.latitude && found.longitude) {
                return [Number(found.latitude), Number(found.longitude)];
            }
        }
        return [16.924471, 82.011247]; // Thossipudi
    }, [activePass]);

    // Resolve Real-Time Live Bus Coordinates from GPS API
    const busCoords = useMemo(() => {
        if (liveBusData?.location?.latitude && liveBusData?.location?.longitude) {
            return [Number(liveBusData.location.latitude), Number(liveBusData.location.longitude)];
        }
        return [16.838217, 82.224991]; // Patavala campus
    }, [liveBusData]);

    // Resolve College Campus Final Destination Coordinates
    const campusCoords = useMemo(() => {
        if (activePass?.routeDetails?.destination?.latitude && activePass?.routeDetails?.destination?.longitude) {
            return [Number(activePass.routeDetails.destination.latitude), Number(activePass.routeDetails.destination.longitude)];
        }
        return [16.839036, 82.225011]; // Pydah College Campus
    }, [activePass]);

    const campusRadius = activePass?.routeDetails?.destination?.radius || 200;

    // Extract all stages along the route including origin, stops, and campus destination
    const allRouteStages = useMemo(() => {
        if (!activePass?.routeDetails?.stages || !Array.isArray(activePass.routeDetails.stages)) {
            return [];
        }
        return activePass.routeDetails.stages.filter(s => s.latitude && s.longitude);
    }, [activePass]);

    // Find student's stage index
    const studentStageIndex = useMemo(() => {
        if (!activePass?.stopName || !allRouteStages.length) return null;
        const target = activePass.stopName.trim().toLowerCase();
        const idx = allRouteStages.findIndex(s => s.stageName && s.stageName.trim().toLowerCase() === target);
        return idx !== -1 ? idx + 1 : null;
    }, [activePass, allRouteStages]);

    // Stage Coordinates for OSRM Road Routing
    const stagePolyline = useMemo(() => {
        return allRouteStages.map(s => [Number(s.latitude), Number(s.longitude)]);
    }, [allRouteStages]);

    // Fetch High-Precision OSRM Road Geometry
    useEffect(() => {
        if (stagePolyline.length > 1) {
            const coordsStr = stagePolyline.map(c => `${c[1]},${c[0]}`).join(';');
            const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${coordsStr}?overview=full&geometries=geojson`;

            fetch(osrmUrl)
                .then(r => r.json())
                .then(data => {
                    if (data.code === 'Ok' && data.routes && data.routes[0]) {
                        const route = data.routes[0];
                        const roadCoords = route.geometry.coordinates.map(c => [c[1], c[0]]);
                        setRoadGeometry(roadCoords);

                        if (route.duration) {
                            const totalMins = Math.round(route.duration / 60);
                            const hrs = Math.floor(totalMins / 60);
                            const mins = totalMins % 60;
                            setRouteDuration(hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`);
                        }
                        if (route.distance) {
                            setRouteDistanceKm((route.distance / 1000).toFixed(1));
                        }
                    }
                })
                .catch(() => {
                    // Graceful fallback to stagePolyline
                });
        }
    }, [stagePolyline]);

    const activePolyline = roadGeometry && roadGeometry.length > 0 ? roadGeometry : stagePolyline;

    // Bounds covering bus, stops, and route
    const allBounds = useMemo(() => {
        if (activePolyline.length > 0) return activePolyline;
        return [busCoords, stopCoords, campusCoords];
    }, [activePolyline, busCoords, stopCoords, campusCoords]);

    // Distance from live bus to student's boarding stop (Haversine in KM)
    const distanceBusToStop = useMemo(() => {
        if (!busCoords || !stopCoords) return null;
        const [lat1, lon1] = busCoords;
        const [lat2, lon2] = stopCoords;
        const R = 6371;
        const dLat = (lat2 - lat1) * (Math.PI / 180);
        const dLon = (lon2 - lon1) * (Math.PI / 180);
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return (R * c).toFixed(1);
    }, [busCoords, stopCoords]);

    // Live ETA & Expected Arrival Time to Student's Stop
    const etaToStop = useMemo(() => {
        if (!distanceBusToStop) return null;
        const dist = parseFloat(distanceBusToStop);
        if (isNaN(dist)) return null;

        const effectiveSpeed = liveSpeed >= 15 ? liveSpeed : 35;
        const minutes = Math.max(1, Math.round((dist / effectiveSpeed) * 60));

        const arrivalDate = new Date(Date.now() + minutes * 60000);
        const hours = arrivalDate.getHours();
        const mins = arrivalDate.getMinutes();
        const ampm = hours >= 12 ? 'PM' : 'AM';
        const formattedHours = hours % 12 || 12;
        const formattedMins = mins < 10 ? `0${mins}` : mins;
        const etaClock = `${formattedHours}:${formattedMins} ${ampm}`;

        return {
            minutes,
            formattedTime: minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes} min`,
            etaClock
        };
    }, [distanceBusToStop, liveSpeed]);

    // Stage Timing Engine for BOTH SIDES (Start -> Destination & Destination -> Start)
    const getStageMetrics = (stage) => {
        const totalDistance = routeDistanceKm ? parseFloat(routeDistanceKm) : 66.8;
        const distFromStart = Number(stage.distanceFromStart) || 0;
        const distToCampus = stage.distanceToDestination != null
            ? Number(stage.distanceToDestination)
            : Math.max(0, totalDistance - distFromStart);

        // 1. Morning Trip: Start -> Destination (KESAVARAM -> PYDAH COLLEGE)
        // Bus starts at 07:00 AM from origin
        const morningTravelMins = Math.round((distFromStart / 35) * 60);
        const morningScheduledTime = addMinutesToTimeStr(MORNING_ORIGIN_START_TIME, morningTravelMins);
        const morningTravelTimeStr = morningTravelMins >= 60
            ? `${Math.floor(morningTravelMins / 60)}h ${morningTravelMins % 60}m`
            : `${morningTravelMins}m`;

        // 2. Evening Trip: Destination -> Start (PYDAH COLLEGE -> KESAVARAM)
        // Bus starts at 04:30 PM from campus
        const eveningTravelMins = Math.round((distToCampus / 35) * 60);
        const eveningScheduledTime = addMinutesToTimeStr(EVENING_CAMPUS_START_TIME, eveningTravelMins);
        const eveningTravelTimeStr = eveningTravelMins >= 60
            ? `${Math.floor(eveningTravelMins / 60)}h ${eveningTravelMins % 60}m`
            : `${eveningTravelMins}m`;

        return {
            morningScheduledTime,
            morningTravelTimeStr,
            eveningScheduledTime,
            eveningTravelTimeStr,
            distFromStart: distFromStart.toFixed(1),
            distToCampus: distToCampus.toFixed(1)
        };
    };

    // Calculate Student's Own Scheduled Timings for Both Sides
    const studentStopMetrics = useMemo(() => {
        if (!activePass?.stopDetails) {
            return {
                morningTime: '7:29 AM',
                morningMins: '29m',
                eveningTime: '5:12 PM',
                eveningMins: '42m'
            };
        }
        const metrics = getStageMetrics(activePass.stopDetails);
        return {
            morningTime: metrics.morningScheduledTime,
            morningMins: metrics.morningTravelTimeStr,
            eveningTime: metrics.eveningScheduledTime,
            eveningMins: metrics.eveningTravelTimeStr
        };
    }, [activePass, routeDistanceKm]);

    // Leaflet Custom Icons
    // 1. Live GPS Bus Marker (High Visibility Movement Radar)
    const busIcon = useMemo(() => {
        const speed = liveSpeed;
        const heading = busHeading;
        const busNum = activePass?.busId || liveBusData?.busNumber || 'AP-39-VA-1853';

        return L.divIcon({
            className: 'clean-leaflet-marker',
            html: `
                <div style="position:relative;width:56px;height:56px;display:flex;align-items:center;justify-content:center;">
                    <!-- Concentric Radar Pulse Waves when in Movement -->
                    ${isMoving ? `
                    <div style="position:absolute;inset:-8px;border-radius:50%;background:#10b981;opacity:0.4;animation:ping 1.3s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
                    <div style="position:absolute;inset:-3px;border-radius:50%;background:#2563eb;opacity:0.3;animation:ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
                    ` : `
                    <div style="position:absolute;inset:-4px;border-radius:50%;background:#3b82f6;opacity:0.25;animation:pulse 2s infinite;"></div>
                    `}

                    <!-- Main Bus Round Icon -->
                    <div style="position:relative;width:40px;height:40px;border-radius:50%;background:${isMoving ? '#059669' : '#1e3a8a'};color:#ffffff;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(0,0,0,0.45);border:2.5px solid #ffffff;">
                        <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M4 16c0 .88.39 1.67 1 2.22V20c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h8v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4s-8 .5-8 4v10zm3.5 1c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm1.5-6H6V6h12v5z"/></svg>

                        <!-- Heading Compass Direction Pointer -->
                        ${heading > 0 ? `
                        <div style="position:absolute;top:-6px;right:-6px;width:18px;height:18px;border-radius:50%;background:#0284c7;border:1.5px solid #fff;display:flex;align-items:center;justify-content:center;transform:rotate(${heading}deg);box-shadow:0 2px 5px rgba(0,0,0,0.3);">
                            <svg width="10" height="10" fill="#fff" viewBox="0 0 24 24"><path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/></svg>
                        </div>` : ''}
                    </div>

                    <!-- Top Speed & Movement Badge -->
                    <div style="position:absolute;top:-20px;left:50%;transform:translateX(-50%);background:${isMoving ? '#064e3b' : '#0f172a'};color:${isMoving ? '#6ee7b7' : '#fbbf24'};font-size:9.5px;font-weight:900;padding:2px 7px;border-radius:10px;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.4);border:1px solid ${isMoving ? '#10b981' : 'rgba(255,255,255,0.2)'};display:flex;align-items:center;gap:3px;">
                        <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${isMoving ? '#10b981' : '#f59e0b'};${isMoving ? 'animation:ping 1s infinite;' : ''}"></span>
                        <span>${isMoving ? `MOVING • ${speed} km/h` : `STOPPED • 0 km/h`}</span>
                    </div>

                    <!-- Bottom Plate Badge -->
                    <div style="position:absolute;bottom:-18px;left:50%;transform:translateX(-50%);background:#0f172a;color:#ffffff;font-size:10px;font-weight:800;padding:2px 7px;border-radius:6px;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.15);">
                        ${busNum}
                    </div>
                </div>
            `,
            iconSize: [56, 56],
            iconAnchor: [28, 28],
            popupAnchor: [0, -30]
        });
    }, [liveBusData, activePass, isMoving, liveSpeed, busHeading]);

    // 2. Student Boarding Stop Beacon (Emerald with Circular Point & Timings)
    const stopIcon = useMemo(() => {
        const stopName = activePass?.stopName || 'THOSSIPUDI';
        const scheduledText = tripDirection === 'morning'
            ? `Pickup ~${studentStopMetrics.morningTime}`
            : `Drop ~${studentStopMetrics.eveningTime}`;

        return L.divIcon({
            className: 'clean-leaflet-marker',
            html: `
                <div style="position:relative;width:46px;height:46px;display:flex;align-items:center;justify-content:center;">
                    <div style="position:absolute;inset:-6px;border-radius:50%;background:#10b981;opacity:0.4;animation:pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;"></div>
                    <div style="position:relative;width:36px;height:36px;border-radius:50%;background:#059669;color:#ffffff;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 14px rgba(0,0,0,0.4);border:2.5px solid #ffffff;">
                        <svg width="19" height="19" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
                    </div>
                    <div style="position:absolute;top:-20px;left:50%;transform:translateX(-50%);background:#064e3b;color:#6ee7b7;font-size:9.5px;font-weight:900;padding:2px 7px;border-radius:10px;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.4);border:1px solid #10b981;display:flex;align-items:center;gap:3px;">
                        <span>⭐ ${scheduledText}</span>
                    </div>
                    <div style="position:absolute;bottom:-18px;left:50%;transform:translateX(-50%);background:#064e3b;color:#ffffff;font-size:10px;font-weight:900;padding:2px 8px;border-radius:6px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.2);">
                        ${stopName} (Your Stop)
                    </div>
                </div>
            `,
            iconSize: [46, 46],
            iconAnchor: [23, 23],
            popupAnchor: [0, -25]
        });
    }, [activePass, tripDirection, studentStopMetrics]);

    // 3. Final Destination: College Campus Icon
    const campusIcon = useMemo(() => {
        const campusTiming = tripDirection === 'morning'
            ? 'Arrives ~8:15 AM'
            : 'Departs: 4:30 PM';

        return L.divIcon({
            className: 'clean-leaflet-marker',
            html: `
                <div style="position:relative;width:46px;height:46px;display:flex;align-items:center;justify-content:center;">
                    <div style="position:relative;width:36px;height:36px;border-radius:50%;background:#7c3aed;color:#ffffff;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 14px rgba(0,0,0,0.4);border:2.5px solid #ffffff;">
                        <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M12 3L1 9l11 6 9-4.91V17h2V9M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82z"/></svg>
                    </div>
                    <div style="position:absolute;top:-20px;left:50%;transform:translateX(-50%);background:#4c1d95;color:#c4b5fd;font-size:9.5px;font-weight:900;padding:2px 7px;border-radius:10px;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.4);border:1px solid #8b5cf6;">
                        🏁 ${campusTiming}
                    </div>
                    <div style="position:absolute;bottom:-18px;left:50%;transform:translateX(-50%);background:#4c1d95;color:#ffffff;font-size:10px;font-weight:900;padding:2px 8px;border-radius:6px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.2);">
                        PYDAH COLLEGE (Campus)
                    </div>
                </div>
            `,
            iconSize: [46, 46],
            iconAnchor: [23, 23],
            popupAnchor: [0, -25]
        });
    }, [tripDirection]);

    // 4. Origin Start Stop Icon
    const originIcon = useMemo(() => {
        const originName = activePass?.routeDetails?.startPoint || 'KESAVARAM';
        const originTiming = tripDirection === 'morning'
            ? 'Starts: 7:00 AM'
            : 'Terminus ~5:45 PM';

        return L.divIcon({
            className: 'clean-leaflet-marker',
            html: `
                <div style="position:relative;width:38px;height:38px;display:flex;align-items:center;justify-content:center;">
                    <div style="position:relative;width:30px;height:30px;border-radius:50%;background:#0284c7;color:#ffffff;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 10px rgba(0,0,0,0.35);border:2px solid #ffffff;">
                        <svg width="15" height="15" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
                    </div>
                    <div style="position:absolute;top:-19px;left:50%;transform:translateX(-50%);background:#0c4a6e;color:#bae6fd;font-size:8.5px;font-weight:900;padding:1.5px 6px;border-radius:8px;white-space:nowrap;border:1px solid rgba(255,255,255,0.2);">
                        🚩 ${originTiming}
                    </div>
                    <div style="position:absolute;bottom:-17px;left:50%;transform:translateX(-50%);background:#0c4a6e;color:#ffffff;font-size:9px;font-weight:900;padding:1px 6px;border-radius:5px;white-space:nowrap;border:1px solid rgba(255,255,255,0.2);">
                        ${originName}
                    </div>
                </div>
            `,
            iconSize: [38, 38],
            iconAnchor: [19, 19],
            popupAnchor: [0, -20]
        });
    }, [activePass, tripDirection]);

    // 5. Clean Circular Milestone Pin (Pristine circular nodes as shown before, uncluttered on mobile)
    const createStagePointIcon = (stageNumber, metrics, direction, showTimeBadge) => {
        const timeText = direction === 'morning' ? metrics.morningScheduledTime : metrics.eveningScheduledTime;

        return L.divIcon({
            className: 'clean-leaflet-marker',
            html: `
                <div style="display:flex;flex-direction:column;align-items:center;cursor:pointer;">
                    ${showTimeBadge ? `
                    <div style="background:#0f172a;color:#38bdf8;font-size:8px;font-weight:900;padding:1px 4.5px;border-radius:8px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.2);margin-bottom:2px;">
                        ${timeText}
                    </div>` : ''}
                    <div style="width:23px;height:23px;border-radius:50%;background:#2563eb;color:#ffffff;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.32);border:2px solid #ffffff;">
                        ${stageNumber}
                    </div>
                </div>
            `,
            iconSize: [26, showTimeBadge ? 38 : 26],
            iconAnchor: [13, showTimeBadge ? 26 : 13],
            popupAnchor: [0, -16]
        });
    };

    const handleLocateStage = (coords) => {
        setCustomFocusCoords(coords);
        setMapFocus('custom');
        setShowFullRouteModal(false);
    };

    if (loading) {
        return (
            <div className="max-w-7xl mx-auto min-h-[70vh] flex flex-col items-center justify-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center animate-pulse shadow-sm">
                    <RiBusFill size={26} />
                </div>
                <p className="text-gray-500 font-medium text-sm">Connecting to Pydah Live GPS Satellite Telemetry...</p>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto space-y-2.5 animate-fade-in pb-2">
            <style>{customMapStyles}</style>

            {hasActivePass ? (
                <>
                    {/* TOP UNIFIED TRANSIT PASS CARD */}
                    <div className="bg-white rounded-2xl p-3 sm:p-4 shadow-sm border border-gray-100 space-y-2.5">
                        {/* Header Row: Active Pass & Live GPS Signal */}
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <h1 className="text-lg font-bold text-gray-900">Transport Pass</h1>
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                    Active
                                </span>
                            </div>
                            <div className="flex items-center gap-1.5 text-[11px] text-gray-400 font-medium">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                                <span className="text-emerald-700 font-semibold">Live GPS</span>
                                <span>•</span>
                                <span className="font-mono">{lastPingTime}</span>
                            </div>
                        </div>

                        {/* Route Corridor Ribbon */}
                        <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-slate-50 border border-slate-100 text-xs">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                                <span className="px-2 py-0.5 rounded bg-indigo-600 text-white font-black text-[11px] shrink-0">
                                    {activePass.routeId || 'R20'}
                                </span>
                                <span className="font-bold text-gray-800 truncate text-xs sm:text-sm" title={activePass.routeName}>
                                    {activePass.routeName || 'Kesavaram Via Anaparthi, Sampara'}
                                </span>
                            </div>
                            <button
                                onClick={() => setShowFullRouteModal(true)}
                                className="px-2.5 py-1 bg-white hover:bg-indigo-50 text-indigo-700 font-bold text-[11px] rounded-lg border border-indigo-100 shadow-sm shrink-0 transition-all flex items-center gap-1 active:scale-95"
                            >
                                <RiRouteFill size={13} />
                                <span>{allRouteStages.length} Stops</span>
                            </button>
                        </div>

                        {/* Direction Selector & Schedule Timings Strip (Cleanly displayed above the map) */}
                        <div className="bg-slate-50/80 p-2.5 rounded-xl border border-slate-100 space-y-2">
                            {/* Tabs */}
                            <div className="flex items-center gap-1.5 bg-white p-1 rounded-lg border border-slate-200/80 shadow-sm text-xs">
                                <button
                                    onClick={() => setTripDirection('morning')}
                                    className={`flex-1 py-1.5 px-2 rounded-md font-bold transition-all flex items-center justify-center gap-1.5 ${
                                        tripDirection === 'morning'
                                            ? 'bg-blue-600 text-white shadow-sm'
                                            : 'text-gray-600 hover:text-gray-900'
                                    }`}
                                >
                                    <RiSunLine size={14} className={tripDirection === 'morning' ? 'text-amber-300' : 'text-amber-500'} />
                                    <span>Morning: Start ➔ Campus</span>
                                </button>
                                <button
                                    onClick={() => setTripDirection('evening')}
                                    className={`flex-1 py-1.5 px-2 rounded-md font-bold transition-all flex items-center justify-center gap-1.5 ${
                                        tripDirection === 'evening'
                                            ? 'bg-indigo-600 text-white shadow-sm'
                                            : 'text-gray-600 hover:text-gray-900'
                                    }`}
                                >
                                    <RiMoonLine size={14} className={tripDirection === 'evening' ? 'text-indigo-200' : 'text-indigo-500'} />
                                    <span>Evening: Campus ➔ Start</span>
                                </button>
                            </div>

                            {/* Schedule Summary */}
                            <div className="flex items-center justify-between text-xs px-1">
                                <div>
                                    <span className="text-gray-400 text-[10px] uppercase font-bold block">
                                        {tripDirection === 'morning' ? '🚩 Bus Commences (Kesavaram)' : '🏁 Bus Departs (Campus)'}
                                    </span>
                                    <span className="font-mono font-black text-gray-800 text-sm">
                                        {tripDirection === 'morning' ? MORNING_ORIGIN_START_TIME : EVENING_CAMPUS_START_TIME}
                                    </span>
                                </div>
                                <div className="text-right">
                                    <span className="text-emerald-600 text-[10px] uppercase font-bold block">
                                        {tripDirection === 'morning' ? '⭐ Expected Pickup' : '⭐ Expected Drop'}
                                    </span>
                                    <span className="font-mono font-black text-emerald-700 text-sm">
                                        ~{tripDirection === 'morning' ? studentStopMetrics.morningTime : studentStopMetrics.eveningTime}
                                        <span className="text-[10px] font-medium text-gray-500 ml-1">
                                            ({tripDirection === 'morning' ? `+${studentStopMetrics.morningMins}` : `+${studentStopMetrics.eveningMins}`})
                                        </span>
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* 2 Clean Structured Stat Cards (Boarding Stop & Live Bus) */}
                        <div className="grid grid-cols-2 gap-2 text-xs">
                            {/* Boarding Stop Card */}
                            <div className="p-2.5 rounded-xl bg-emerald-50/50 border border-emerald-100 flex flex-col justify-between">
                                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                                    <span>Boarding Stop</span>
                                    <RiMapPin2Fill size={14} className="text-emerald-600" />
                                </div>
                                <div className="font-black text-emerald-950 text-sm sm:text-base truncate mt-0.5">
                                    {activePass.stopName || 'THOSSIPUDI'}
                                </div>
                                <div className="text-[10px] font-medium text-emerald-800/90 mt-1 flex items-center gap-1 truncate">
                                    <span>Stage #{studentStageIndex || 6}</span>
                                    {distanceBusToStop && (
                                        <>
                                            <span>•</span>
                                            <span className="font-bold">~{distanceBusToStop} km away</span>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Assigned Bus Card */}
                            <div className="p-2.5 rounded-xl bg-blue-50/50 border border-blue-100 flex flex-col justify-between">
                                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-blue-700">
                                    <span>Assigned Bus</span>
                                    <RiBusFill size={14} className="text-blue-600" />
                                </div>
                                <div className="font-black text-blue-950 text-sm sm:text-base truncate mt-0.5">
                                    {activePass.busId || liveBusData?.busNumber || 'AP-39-VA-1853'}
                                </div>
                                <div className="text-[10px] font-medium text-blue-800/90 mt-1 flex items-center gap-1 truncate">
                                    <span className={`px-1.5 py-0.2 rounded font-bold uppercase text-[9px] ${
                                        isMoving
                                            ? 'bg-emerald-100 text-emerald-800 font-black'
                                            : 'bg-amber-100 text-amber-800 font-semibold'
                                    }`}>
                                        {isMoving ? `Moving (${liveSpeed}k)` : (liveBusData?.location?.status || 'Stopped')}
                                    </span>
                                    <span>•</span>
                                    <span>{activePass.busDetails?.capacity || 56} Seats</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ADVANCED GOOGLE MAPS HYBRID LIVE TRACKING & NAVIGATION VIEW */}
                    <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 relative">
                        {/* 1. AUTOMATIC LIVE TRACKING BANNER (APPEARS AUTOMATICALLY ONLY WHEN BUS IS IN MOVEMENT) */}
                        {isMoving && (
                            <div className="absolute top-2.5 left-2.5 right-2.5 z-[1000] bg-slate-950/95 backdrop-blur-md text-white rounded-2xl p-2.5 sm:p-3 shadow-2xl border border-emerald-500/60 space-y-1.5 animate-slide-down">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/50 flex items-center justify-center text-emerald-400 shrink-0">
                                            <RiNavigationFill size={18} className="animate-bounce text-emerald-400" />
                                        </div>
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-1.5">
                                                <span className="px-1.5 py-0.2 rounded bg-emerald-500 text-white font-black text-[9px] uppercase tracking-wider animate-pulse">
                                                    Live In Motion
                                                </span>
                                                <span className="font-mono text-emerald-400 font-bold text-xs">
                                                    {liveSpeed} km/h
                                                </span>
                                            </div>
                                            <div className="text-xs font-bold text-slate-100 truncate mt-0.5">
                                                En Route to {activePass.stopName}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="text-right shrink-0">
                                        <div className="text-base sm:text-lg font-black text-emerald-400 font-mono leading-none">
                                            ~{etaToStop?.etaClock || '1:45 PM'}
                                        </div>
                                        <div className="text-[10px] text-slate-300 font-semibold mt-0.5">
                                            {etaToStop?.formattedTime || '42 min'} ({distanceBusToStop || '24.7'} km)
                                        </div>
                                    </div>
                                </div>

                                {/* Sub-bar with Telemetry details */}
                                <div className="pt-1 border-t border-slate-800 flex items-center justify-between text-[9px] text-slate-400">
                                    <span>Bus: <strong>{activePass.busId || 'AP-39-VA-1853'}</strong></span>
                                    {busHeading > 0 && <span>Heading: <strong>{busHeading}°</strong></span>}
                                    <span>Telemetry: <strong>{lastPingTime}</strong></span>
                                </div>
                            </div>
                        )}

                        {/* 2. MAP QUICK ACTION BUTTONS (CLEAN BOTTOM-CENTER PILL BAR, ZERO OVERLAP) */}
                        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-1 bg-white/95 backdrop-blur-md px-2 py-1 rounded-2xl shadow-xl border border-gray-200">
                            <button
                                onClick={() => setMapFocus('bus')}
                                className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold rounded-xl flex items-center gap-1 transition-all active:scale-95"
                                title="Center on Live Bus"
                            >
                                <RiBusFill size={13} />
                                <span>Bus</span>
                            </button>
                            <button
                                onClick={() => setMapFocus('stop')}
                                className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold rounded-xl flex items-center gap-1 transition-all active:scale-95"
                                title="Center on My Boarding Stop"
                            >
                                <RiMapPin2Fill size={13} />
                                <span>Stop</span>
                            </button>
                            <button
                                onClick={() => setMapFocus('campus')}
                                className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-bold rounded-xl flex items-center gap-1 transition-all active:scale-95"
                                title="Center on Final Destination (Campus)"
                            >
                                <RiBuilding2Fill size={13} />
                                <span>Campus</span>
                            </button>
                            <button
                                onClick={() => setMapFocus('fit')}
                                className="px-2.5 py-1 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl flex items-center gap-1 transition-all active:scale-95"
                                title="Fit Entire Route"
                            >
                                <RiCrosshair2Line size={13} />
                                <span>Fit</span>
                            </button>
                        </div>

                        {/* MAP CONTAINER (Full Height, completely uncluttered) */}
                        <div className="h-[520px] sm:h-[560px] w-full">
                            <MapContainer
                                center={stopCoords}
                                zoom={13}
                                scrollWheelZoom={true}
                                className="h-full w-full z-0"
                            >
                                <LayersControl position="bottomleft">
                                    <LayersControl.BaseLayer checked name="Satellite Hybrid">
                                        <TileLayer
                                            url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
                                            maxZoom={20}
                                            subdomains={['mt0', 'mt1', 'mt2', 'mt3']}
                                            attribution="&copy; Google Maps Hybrid"
                                        />
                                    </LayersControl.BaseLayer>
                                    <LayersControl.BaseLayer name="Street View">
                                        <TileLayer
                                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                            maxZoom={19}
                                            attribution="&copy; OpenStreetMap"
                                        />
                                    </LayersControl.BaseLayer>
                                    <LayersControl.BaseLayer name="Carto Clean">
                                        <TileLayer
                                            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                                            maxZoom={20}
                                            attribution="&copy; CARTO"
                                        />
                                    </LayersControl.BaseLayer>
                                </LayersControl>

                                <MapViewController
                                    targetCoords={
                                        mapFocus === 'bus'
                                            ? busCoords
                                            : mapFocus === 'stop'
                                            ? stopCoords
                                            : mapFocus === 'campus'
                                            ? campusCoords
                                            : mapFocus === 'custom'
                                            ? customFocusCoords
                                            : null
                                    }
                                    zoom={mapFocus === 'bus' ? 16 : 14}
                                    bounds={mapFocus === 'fit' ? allBounds : null}
                                />

                                {/* High-Precision Road Corridor Route Line */}
                                {activePolyline.length > 1 && (
                                    <>
                                        <Polyline
                                            positions={activePolyline}
                                            pathOptions={{ color: '#0ea5e9', weight: 6.5, opacity: 0.45 }}
                                        />
                                        <Polyline
                                            positions={activePolyline}
                                            pathOptions={{ color: '#2563eb', weight: 3.5, opacity: 0.95 }}
                                        />
                                    </>
                                )}

                                {/* Campus Final Destination 200m Arrival Radius Circle */}
                                <Circle
                                    center={campusCoords}
                                    radius={campusRadius}
                                    pathOptions={{
                                        color: '#7c3aed',
                                        fillColor: '#8b5cf6',
                                        fillOpacity: 0.22,
                                        weight: 2,
                                        dashArray: '4, 4'
                                    }}
                                />

                                {/* 1. Route Origin Marker */}
                                <Marker position={[Number(allRouteStages[0]?.latitude), Number(allRouteStages[0]?.longitude)]} icon={originIcon}>
                                    <Popup>
                                        <div className="p-1.5 space-y-1 text-xs">
                                            <div className="font-bold text-blue-600">🚩 Route Origin: {allRouteStages[0]?.stageName || 'KESAVARAM'}</div>
                                            <p className="text-gray-700">
                                                <strong>Morning Start:</strong> {MORNING_ORIGIN_START_TIME}
                                            </p>
                                            <p className="text-gray-700">
                                                <strong>Evening Terminus:</strong> ~5:45 PM
                                            </p>
                                            <p className="text-gray-500">Commencement point • 0 KM</p>
                                        </div>
                                    </Popup>
                                </Marker>

                                {/* 2. Student's Designated Boarding Stop Marker */}
                                <Marker position={stopCoords} icon={stopIcon}>
                                    <Popup>
                                        <div className="p-2 space-y-1 text-xs min-w-[210px]">
                                            <div className="font-bold text-emerald-600 flex items-center gap-1 border-b border-gray-100 pb-1">
                                                <RiMapPin2Fill size={15} />
                                                <span>Your Boarding Stop: {activePass.stopName}</span>
                                            </div>
                                            <div className="bg-emerald-50/70 p-2 rounded-xl border border-emerald-100 space-y-1 text-emerald-950">
                                                <p className="font-bold flex items-center justify-between">
                                                    <span>🌅 Morning Pickup:</span>
                                                    <span className="font-mono text-emerald-800">~{studentStopMetrics.morningTime}</span>
                                                </p>
                                                <p className="font-bold flex items-center justify-between">
                                                    <span>🌇 Evening Drop:</span>
                                                    <span className="font-mono text-emerald-800">~{studentStopMetrics.eveningTime}</span>
                                                </p>
                                            </div>
                                            <p className="text-blue-700 font-bold pt-0.5">
                                                Live GPS ETA: ~{etaToStop?.etaClock} ({etaToStop?.formattedTime})
                                            </p>
                                            <p className="text-gray-500 text-[11px]">
                                                Distance: {activePass.stopDetails?.distanceFromStart || '17.13'} KM from start • {activePass.stopDetails?.distanceToDestination || '24.65'} KM to campus
                                            </p>
                                        </div>
                                    </Popup>
                                </Marker>

                                {/* 3. Final Destination: Campus Gate Marker */}
                                <Marker position={campusCoords} icon={campusIcon}>
                                    <Popup>
                                        <div className="p-2 space-y-1 text-xs min-w-[210px]">
                                            <div className="font-bold text-purple-600 flex items-center gap-1 border-b border-gray-100 pb-1">
                                                <RiBuilding2Fill size={15} />
                                                <span>🏁 Final Destination: PYDAH COLLEGE</span>
                                            </div>
                                            <div className="bg-purple-50/70 p-2 rounded-xl border border-purple-100 space-y-1 text-purple-950">
                                                <p className="font-bold flex items-center justify-between">
                                                    <span>🌅 Morning Arrival:</span>
                                                    <span className="font-mono text-purple-800">~8:15 AM</span>
                                                </p>
                                                <p className="font-bold flex items-center justify-between">
                                                    <span>🌇 Evening Dispersal:</span>
                                                    <span className="font-mono text-purple-800">{EVENING_CAMPUS_START_TIME}</span>
                                                </p>
                                            </div>
                                            <p className="text-gray-500 text-[11px]">
                                                Total Route: {routeDistanceKm || 70} KM • Geofence: {campusRadius}m radius
                                            </p>
                                        </div>
                                    </Popup>
                                </Marker>

                                {/* 4. ALL INTERMEDIATE STOPS (Pristine circular nodes as shown before, uncluttered on mobile) */}
                                {allRouteStages.map((stage, idx) => {
                                    const isStudentStop = activePass?.stopName && stage.stageName?.trim().toLowerCase() === activePass.stopName.trim().toLowerCase();
                                    const isOrigin = idx === 0;
                                    const isCampus = stage.isCampusDestination || (idx === allRouteStages.length - 1 && stage.stageName?.toUpperCase().includes('PYDAH'));

                                    if (isStudentStop || isOrigin || isCampus) return null;

                                    const metrics = getStageMetrics(stage);

                                    return (
                                        <Marker
                                            key={`stage_point_${idx}`}
                                            position={[Number(stage.latitude), Number(stage.longitude)]}
                                            icon={createStagePointIcon(idx + 1, metrics, tripDirection, showStopTimesOnMap)}
                                        >
                                            <Tooltip direction="top" offset={[0, -18]} className="stage-tooltip">
                                                #{idx + 1} {stage.stageName} ({tripDirection === 'morning' ? metrics.morningScheduledTime : metrics.eveningScheduledTime})
                                            </Tooltip>
                                            <Popup>
                                                <div className="p-1.5 text-xs space-y-1.5 min-w-[190px]">
                                                    <div className="font-bold text-indigo-600 text-sm border-b border-gray-100 pb-0.5">
                                                        Stage #{idx + 1}: {stage.stageName}
                                                    </div>
                                                    <div className="bg-slate-50 p-1.5 rounded-lg border border-slate-100 space-y-0.5 text-slate-800">
                                                        <div className="flex items-center justify-between font-bold text-emerald-700">
                                                            <span>🌅 Morning Pickup:</span>
                                                            <span className="font-mono">~{metrics.morningScheduledTime}</span>
                                                        </div>
                                                        <div className="flex items-center justify-between font-bold text-indigo-700">
                                                            <span>🌇 Evening Drop:</span>
                                                            <span className="font-mono">~{metrics.eveningScheduledTime}</span>
                                                        </div>
                                                    </div>
                                                    <div className="text-gray-500 text-[10px] flex items-center justify-between pt-0.5">
                                                        <span>From Start: {metrics.distFromStart} KM</span>
                                                        <span>To Campus: {metrics.distToCampus} KM</span>
                                                    </div>
                                                </div>
                                            </Popup>
                                        </Marker>
                                    );
                                })}

                                {/* 5. Live GPS Bus Marker with Enhanced Movement Radar */}
                                <Marker position={busCoords} icon={busIcon}>
                                    <Popup>
                                        <div className="p-1.5 space-y-1.5 text-xs min-w-[200px]">
                                            <div className="flex items-center justify-between text-blue-600 font-bold border-b border-gray-100 pb-1">
                                                <div className="flex items-center gap-1.5">
                                                    <RiBusFill size={16} />
                                                    <span>Live GPS Telemetry</span>
                                                </div>
                                                <span className={`px-1.5 py-0.2 rounded font-bold uppercase text-[9px] ${
                                                    isMoving ? 'bg-emerald-100 text-emerald-800 font-black' : 'bg-amber-100 text-amber-800'
                                                }`}>
                                                    {isMoving ? 'In Motion' : 'Stopped'}
                                                </span>
                                            </div>
                                            <p className="font-black text-gray-900 text-base">{activePass.busId || liveBusData?.busNumber || 'AP-39-VA-1853'}</p>
                                            
                                            <div className="grid grid-cols-2 gap-1.5 bg-slate-50 p-2 rounded-xl text-slate-800">
                                                <div>
                                                    <span className="text-gray-400 text-[9px] uppercase font-bold block">Live Speed</span>
                                                    <span className="font-mono font-black text-sm text-blue-700">{liveSpeed} km/h</span>
                                                </div>
                                                <div>
                                                    <span className="text-gray-400 text-[9px] uppercase font-bold block">Ignition</span>
                                                    <span className={`font-bold text-xs ${ignitionActive ? 'text-emerald-600' : 'text-slate-500'}`}>
                                                        {ignitionActive ? 'Engine ON' : 'Engine OFF'}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="text-emerald-700 font-bold text-xs pt-0.5">
                                                ETA to your stop: ~{etaToStop?.etaClock} ({etaToStop?.formattedTime})
                                            </div>

                                            <div className="text-gray-400 text-[10px] pt-1 border-t border-gray-100 flex items-center justify-between">
                                                <span>Telemetry: {lastPingTime}</span>
                                                {busHeading > 0 && <span>Heading: {busHeading}°</span>}
                                            </div>
                                        </div>
                                    </Popup>
                                </Marker>
                            </MapContainer>
                        </div>
                    </div>

                    {/* MODAL: FULL BUS ROUTE & STAGES TIMELINE (WITH BOTH SIDES TIMINGS) */}
                    {showFullRouteModal && (
                        <div className="fixed inset-0 z-[2000] bg-black/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 animate-fade-in">
                            <div className="bg-white rounded-2xl max-w-xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-gray-100 overflow-hidden">
                                {/* Modal Header */}
                                <div className="p-4 sm:px-5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="px-2 py-0.5 rounded bg-indigo-600 text-white text-xs font-bold">
                                                {activePass.routeId}
                                            </span>
                                            <h3 className="font-bold text-gray-900 text-base">Route Schedule (Both Directions)</h3>
                                        </div>
                                        <p className="text-xs text-gray-500 mt-0.5">
                                            Morning Start: <strong>{MORNING_ORIGIN_START_TIME}</strong> • Evening Dispersal: <strong>{EVENING_CAMPUS_START_TIME}</strong>
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => setShowFullRouteModal(false)}
                                        className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-500 transition-all"
                                    >
                                        <RiCloseLine size={20} />
                                    </button>
                                </div>

                                {/* Stages List with Both Sides Timings */}
                                <div className="overflow-y-auto p-3 sm:p-4 space-y-2 divide-y divide-gray-100">
                                    {allRouteStages.map((stage, idx) => {
                                        const isStudentStop = activePass?.stopName && stage.stageName?.trim().toLowerCase() === activePass.stopName.trim().toLowerCase();
                                        const isOrigin = idx === 0;
                                        const isCampus = stage.isCampusDestination || (idx === allRouteStages.length - 1 && stage.stageName?.toUpperCase().includes('PYDAH'));
                                        const coords = [Number(stage.latitude), Number(stage.longitude)];
                                        const metrics = getStageMetrics(stage);

                                        return (
                                            <div
                                                key={`modal_stage_${idx}`}
                                                className={`pt-2.5 first:pt-0 flex items-center justify-between gap-3 text-xs ${
                                                    isStudentStop ? 'bg-emerald-50 -mx-2 px-2.5 py-2.5 rounded-xl border border-emerald-200' : ''
                                                } ${
                                                    isCampus ? 'bg-purple-50 -mx-2 px-2.5 py-2.5 rounded-xl border border-purple-200' : ''
                                                }`}
                                            >
                                                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                                    <div className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0 ${
                                                        isStudentStop
                                                            ? 'bg-emerald-600 text-white'
                                                            : isCampus
                                                            ? 'bg-purple-600 text-white'
                                                            : isOrigin
                                                            ? 'bg-blue-600 text-white'
                                                            : 'bg-gray-100 text-gray-700'
                                                    }`}>
                                                        {isCampus ? '🏁' : isOrigin ? '🚩' : idx + 1}
                                                    </div>

                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                            <span className={`font-bold ${
                                                                isStudentStop ? 'text-emerald-950 font-black' : isCampus ? 'text-purple-950 font-black' : 'text-gray-800'
                                                            }`}>
                                                                {stage.stageName}
                                                            </span>
                                                            {isStudentStop && (
                                                                <span className="px-1.5 py-0.2 rounded bg-emerald-600 text-white text-[9px] font-bold">
                                                                    Your Stop
                                                                </span>
                                                            )}
                                                            {isCampus && (
                                                                <span className="px-1.5 py-0.2 rounded bg-purple-600 text-white text-[9px] font-bold">
                                                                    Final Destination
                                                                </span>
                                                            )}
                                                        </div>

                                                        {/* Both Sides Timings Row */}
                                                        <div className="grid grid-cols-2 gap-1.5 mt-1 text-[10px]">
                                                            <div className="bg-blue-50/80 px-2 py-0.5 rounded text-blue-900 font-medium">
                                                                🌅 Pickup: <strong>~{metrics.morningScheduledTime}</strong>
                                                            </div>
                                                            <div className="bg-indigo-50/80 px-2 py-0.5 rounded text-indigo-900 font-medium">
                                                                🌇 Drop: <strong>~{metrics.eveningScheduledTime}</strong>
                                                            </div>
                                                        </div>

                                                        <div className="text-gray-400 text-[10px] flex items-center gap-1.5 mt-1">
                                                            <span>{metrics.distFromStart} KM from origin</span>
                                                            <span>•</span>
                                                            <span>{metrics.distToCampus} KM to campus</span>
                                                            {stage.fare ? (
                                                                <>
                                                                    <span>•</span>
                                                                    <span className="text-emerald-700 font-bold">₹{stage.fare}</span>
                                                                </>
                                                            ) : null}
                                                        </div>
                                                    </div>
                                                </div>

                                                <button
                                                    onClick={() => handleLocateStage(coords)}
                                                    className="px-2 py-1 bg-white hover:bg-gray-100 text-gray-700 font-bold text-[10px] rounded-lg border border-gray-200 shadow-sm shrink-0 flex items-center gap-1 transition-all"
                                                >
                                                    <RiFocus3Line size={12} className="text-indigo-600" />
                                                    <span>Locate</span>
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Modal Footer */}
                                <div className="p-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                                    <span className="text-[11px] text-gray-500">Tap Locate to center on any stop</span>
                                    <button
                                        onClick={() => setShowFullRouteModal(false)}
                                        className="px-3 py-1 bg-gray-900 hover:bg-gray-800 text-white rounded-lg text-xs font-bold transition-all shadow-sm"
                                    >
                                        Close
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </>
            ) : (
                /* Empty / Inactive Fallback */
                <div className="bg-white rounded-3xl p-10 sm:p-14 text-center shadow-sm border border-gray-100 max-w-xl mx-auto space-y-4">
                    <div className="w-16 h-16 rounded-2xl bg-gray-50 text-gray-400 flex items-center justify-center mx-auto">
                        <RiBusFill size={32} />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-gray-900">No Active Transport Pass</h2>
                        <p className="text-sm text-gray-500 mt-1 leading-relaxed">
                            No active transport pass found for admission number{' '}
                            <span className="font-semibold text-gray-800">{user?.admission_number || '–'}</span>.
                        </p>
                    </div>
                    <div className="p-4 rounded-2xl bg-amber-50 border border-amber-100 text-amber-800 text-xs text-left">
                        <p className="font-bold">Need Transport Facility?</p>
                        <p className="mt-0.5 text-amber-700">
                            If you recently availed college bus transport, please contact the transport department to activate your pass.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Transport;
