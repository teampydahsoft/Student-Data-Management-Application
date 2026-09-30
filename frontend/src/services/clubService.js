import api from '../config/api';

const getClubs = async () => {
    const response = await api.get('/clubs');
    return response.data;
};

const getClubDetails = async (clubId) => {
    const response = await api.get(`/clubs/${clubId}`);
    return response.data;
};

const createClub = async (clubData) => {
    const isFormData = clubData instanceof FormData;
    const config = isFormData ? { headers: { 'Content-Type': 'multipart/form-data' } } : {};

    const response = await api.post('/clubs', clubData, config);
    return response.data;
};

const joinClub = async (clubId) => {
    const response = await api.post(`/clubs/${clubId}/join`);
    return response.data;
};

const updateMembershipStatus = async (clubId, studentId, status) => {
    const response = await api.patch(`/clubs/${clubId}/members`, { studentId, status });
    return response.data;
};

const createActivity = async (clubId, activityData) => {
    const isFormData = activityData instanceof FormData;
    const config = isFormData ? { headers: { 'Content-Type': 'multipart/form-data' } } : {};

    const response = await api.post(`/clubs/${clubId}/activities`, activityData, config);
    return response.data;
};

const updateClub = async (clubId, formData) => {
    const isFormData = formData instanceof FormData;
    const config = isFormData ? { headers: { 'Content-Type': 'multipart/form-data' } } : {};
    const response = await api.put(`/clubs/${clubId}`, formData, config);
    return response.data;
};

const deleteClub = async (clubId) => {
    const response = await api.delete(`/clubs/${clubId}`);
    return response.data;
};

const updateActivity = async (clubId, activityId, activityData) => {
    const isFormData = activityData instanceof FormData;
    const config = isFormData ? { headers: { 'Content-Type': 'multipart/form-data' } } : {};
    const response = await api.put(`/clubs/${clubId}/activities/${activityId}`, activityData, config);
    return response.data;
};

const deleteActivity = async (clubId, activityId) => {
    const response = await api.delete(`/clubs/${clubId}/activities/${activityId}`);
    return response.data;
};

const toggleClubStatus = async (clubId, isActive) => {
    const response = await api.patch(`/clubs/${clubId}/status`, { isActive });
    return response.data;
};

const getClubRoles = async () => {
    const response = await api.get('/clubs/roles');
    return response.data;
};

const createClubRole = async (roleData) => {
    const response = await api.post('/clubs/roles', roleData);
    return response.data;
};

const updateClubRole = async (roleId, roleData) => {
    const response = await api.put(`/clubs/roles/${roleId}`, roleData);
    return response.data;
};

const deleteClubRole = async (roleId) => {
    const response = await api.delete(`/clubs/roles/${roleId}`);
    return response.data;
};

const checkHrmsUserAccount = async (params) => {
    const response = await api.get('/clubs/check-hrms-user', { params });
    return response.data;
};

const searchHrmsEmployees = async (query) => {
    const response = await api.get('/rbac/users/search-hrms-employee', { params: { query } });
    return response.data;
};

const getAllClubApprovals = async () => {
    const response = await api.get('/clubs/approvals/all');
    return response.data;
};

const getAllClubStudents = async (params) => {
    const response = await api.get('/clubs/students/all', { params });
    return response.data;
};

export default {
    getClubs,
    getClubDetails,
    createClub,
    joinClub,
    updateMembershipStatus,
    createActivity,
    updateClub,
    deleteClub,
    updateActivity,
    deleteActivity,
    toggleClubStatus,
    getClubRoles,
    createClubRole,
    updateClubRole,
    deleteClubRole,
    checkHrmsUserAccount,
    searchHrmsEmployees,
    getAllClubApprovals,
    getAllClubStudents
};
