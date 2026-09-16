import api from '../config/api';

const transportService = {
    getRoutes: () => {
        return api.get('/transport/routes');
    },

    getBuses: () => {
        return api.get('/transport/buses');
    },

    createRequest: (data) => {
        return api.post('/transport/request', data);
    },

    getMyRequests: () => {
        return api.get('/transport/my-requests');
    },

    getMyTransportDetails: (admissionNumber) => {
        const query = admissionNumber ? `?admission_number=${encodeURIComponent(admissionNumber)}` : '';
        return api.get(`/transport/my-details${query}`);
    },

    getLiveBusLocation: (busNumber) => {
        const cleanKey = busNumber ? `/${encodeURIComponent(busNumber)}` : '';
        return api.get(`/transport/gps/live-location${cleanKey}`);
    }
};

export default transportService;
