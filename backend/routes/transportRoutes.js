const express = require('express');
const router = express.Router();
const transportController = require('../controllers/transportController');
const verifyToken = require('../middleware/auth');

// Get all routes (Public or Authenticated?) - Let's keep it authenticated for students
router.get('/routes', verifyToken, transportController.getAllRoutes);

// Get all buses
router.get('/buses', verifyToken, transportController.getBuses);

// Create Request
router.post('/request', verifyToken, transportController.createTransportRequest);

// Get My Requests (Enriched)
router.get('/my-requests', verifyToken, transportController.getMyTransportRequests);

// Get My Transport Details (Active Pass, Route ID, Stop ID, Stop Name, Bus ID)
router.get('/my-details', verifyToken, transportController.getMyTransportDetails);

// Live GPS Tracking Endpoints (Vehicle coordinates, speed, heading, status)
router.get('/gps/live-location/:busNumber', verifyToken, transportController.getBusLiveLocation);
router.get('/gps/live-location', verifyToken, transportController.getBusLiveLocation);

module.exports = router;
