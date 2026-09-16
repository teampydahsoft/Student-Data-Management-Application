const express = require('express');
const router = express.Router();
const transportController = require('../controllers/transportController');

/**
 * Pydah Live GPS Vehicle Tracking API Routes
 * Compliant with Live GPS Tracking API Integration Guide:
 * Base Path: /api/gps
 * 
 * Endpoint 1: GET /live-location/:busNumber OR /live-location?busNumber=:busNumber
 * Endpoint 2: GET /live-location OR /live-location?routeId=:routeId
 */

router.get('/live-location/:busNumber', transportController.getBusLiveLocation);
router.get('/live-location', transportController.getBusLiveLocation);

module.exports = router;
