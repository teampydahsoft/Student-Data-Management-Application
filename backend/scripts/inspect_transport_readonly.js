/**
 * Standalone Read-Only Inspection Script for Transport MongoDB Database (pydah_transport)
 * 
 * Usage:
 *   node backend/scripts/inspect_transport_readonly.js [admission_number]
 *   e.g.: node backend/scripts/inspect_transport_readonly.js 20230353
 * 
 * STRICT READ-ONLY:
 *   - Connects with readPreference: 'secondaryPreferred'
 *   - No write, update, insert, or delete operations are executed.
 */

const { MongoClient } = require('mongodb');
require('dotenv').config({ path: __dirname + '/../.env' });

const MONGO_URI = process.env.TRANSPORT_MONGO_URI || 'mongodb+srv://durgaprasad:durga2144@cluster0.i5iew6d.mongodb.net/pydah_transport?retryWrites=true&w=majority&appName=Cluster0';
const TARGET_ADMISSION_NUMBER = process.argv[2] || '20230353';

async function inspectTransportReadOnly() {
    console.log('===============================================================');
    console.log('  PYDAH TRANSPORT DATABASE READ-ONLY INSPECTOR');
    console.log('===============================================================');
    console.log(`Target Admission Number: ${TARGET_ADMISSION_NUMBER}`);
    console.log(`Database URI: ${MONGO_URI.replace(/:([^@]+)@/, ':****@')}`);
    console.log('Read Preference: secondaryPreferred (Strict Read-Only)\n');

    const client = new MongoClient(MONGO_URI, {
        readPreference: 'secondaryPreferred'
    });

    try {
        await client.connect();
        const db = client.db('pydah_transport');

        // 1. Query transport_requests for the target student
        console.log(`🔍 Querying 'transport_requests' for admission_number = '${TARGET_ADMISSION_NUMBER}'...`);
        const requests = await db.collection('transport_requests').find({
            $or: [
                { admission_number: TARGET_ADMISSION_NUMBER },
                { admission_number: Number(TARGET_ADMISSION_NUMBER) },
                { admissionNumber: TARGET_ADMISSION_NUMBER }
            ]
        }).sort({ id: -1, _id: -1 }).toArray();

        if (requests.length === 0) {
            console.log(`❌ No transport requests found for admission number: ${TARGET_ADMISSION_NUMBER}`);
            return;
        }

        console.log(`✅ Found ${requests.length} transport request document(s) in pydah_transport:\n`);

        for (let i = 0; i < requests.length; i++) {
            const req = requests[i];
            console.log(`---------------- Request #${i + 1} ----------------`);
            console.log(`• Document _id         : ${req._id}`);
            console.log(`• Transport Request ID : ${req.id}`);
            console.log(`• Application Number   : ${req.application_number || 'N/A'}`);
            console.log(`• Student Name         : ${req.student_name}`);
            console.log(`• Admission Number     : ${req.admission_number}`);
            console.log(`• Academic Year        : ${req.academic_year || 'N/A'}`);
            console.log(`• Route ID             : ${req.route_id}`);
            console.log(`• Route Name           : ${req.route_name}`);
            console.log(`• Boarding Stage/Stop  : ${req.stage_name}`);
            console.log(`• Allocated Bus ID     : ${req.bus_id || 'N/A'}`);
            console.log(`• Fare                 : ₹${req.fare}`);
            console.log(`• Request Status       : ${req.status}`);
            console.log(`• Physical Card / QR   : ${req.physical_card_qr || 'N/A'}`);
            console.log(`• Cancelled At         : ${req.cancelled_at || 'None'}`);
            console.log(`• Not Interested       : ${req.not_interested || 'No'}`);

            // Active Pass State Evaluation
            const isActivePass = (
                (req.status === 'approved' || req.status === 'Active' || req.status === 'active') &&
                !req.cancelled_at &&
                !req.not_interested
            );
            console.log(`• Pass Active State    : ${isActivePass ? '🟢 ACTIVE PASS' : '🔴 INACTIVE / PENDING'}`);

            // 2. Fetch Route and Stop ID from routes collection
            if (req.route_id) {
                console.log(`\n  📍 Fetching Route details for Route ID: '${req.route_id}'...`);
                const routeDoc = await db.collection('routes').findOne({
                    $or: [
                        { routeId: req.route_id },
                        { route_id: req.route_id },
                        { routeId: String(req.route_id) }
                    ]
                });

                if (routeDoc) {
                    console.log(`  • Route Name         : ${routeDoc.routeName}`);
                    console.log(`  • Corridor           : ${routeDoc.startPoint} ➔ ${routeDoc.endPoint}`);
                    console.log(`  • Total Distance     : ${routeDoc.totalDistance} KM`);
                    console.log(`  • Estimated Time     : ${routeDoc.estimatedTime || 'N/A'}`);

                    // Locate matching stage in stages array to extract Stop ID
                    if (routeDoc.stages && Array.isArray(routeDoc.stages)) {
                        const stageMatch = routeDoc.stages.find(
                            s => s.stageName && s.stageName.trim().toLowerCase() === (req.stage_name || '').trim().toLowerCase()
                        );
                        if (stageMatch) {
                            console.log(`  🎯 MATCHED STOP / STAGE:`);
                            console.log(`     - Stop ID (_id)       : ${stageMatch._id}`);
                            console.log(`     - Stop Name           : ${stageMatch.stageName}`);
                            console.log(`     - Distance From Start : ${stageMatch.distanceFromStart} KM`);
                            console.log(`     - Stage Fare          : ₹${stageMatch.fare}`);
                            if (stageMatch.coordinates) {
                                console.log(`     - Coordinates         : Lat ${stageMatch.coordinates.latitude}, Lng ${stageMatch.coordinates.longitude}`);
                            }
                        } else {
                            console.log(`  ⚠️ Stage '${req.stage_name}' not matched in route stages list.`);
                        }
                    }
                } else {
                    console.log(`  ⚠️ Route '${req.route_id}' not found in 'routes' collection.`);
                }
            }

            // 3. Fetch Bus details from buses collection
            if (req.bus_id) {
                console.log(`\n  🚌 Fetching Bus details for Bus ID: '${req.bus_id}'...`);
                const busDoc = await db.collection('buses').findOne({
                    $or: [
                        { busNumber: req.bus_id },
                        { bus_id: req.bus_id },
                        { registrationNumber: req.bus_id }
                    ]
                });
                if (busDoc) {
                    console.log(`  • Bus Number         : ${busDoc.busNumber}`);
                    console.log(`  • Seating Capacity   : ${busDoc.capacity || busDoc.seatingCapacity}`);
                    console.log(`  • Bus Status         : ${busDoc.status}`);
                    console.log(`  • Driver Name        : ${busDoc.driverName || 'N/A'}`);
                    console.log(`  • Driver Phone       : ${busDoc.driverPhone || 'N/A'}`);
                } else {
                    console.log(`  ℹ️ Bus '${req.bus_id}' not found in 'buses' collection.`);
                }
            }
            console.log('---------------------------------------------------\n');
        }

    } catch (err) {
        console.error('Error during read-only inspection:', err);
    } finally {
        await client.close();
        console.log('Read-only connection closed.');
    }
}

inspectTransportReadOnly();
