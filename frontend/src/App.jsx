import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import useAuthStore from './store/authStore';

// Pages
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import AuthCallback from './pages/AuthCallback';
import Forms from './pages/Forms';
import FormBuilder from './pages/FormBuilder';
import FeedbackForms from './pages/FeedbackForms';
import FeedbackFormBuilder from './pages/FeedbackFormBuilder';
import Submissions from './pages/Submissions';
import Students from './pages/Students';
import AddStudent from './pages/AddStudent';
import Settings from './pages/Settings';
import PublicForm from './pages/PublicForm';
import Attendance from './pages/Attendance';
import GetStarted from './pages/GetStarted';

import UserManagement from './pages/UserManagement';
import StudentFieldPermissions from './pages/StudentFieldPermissions';
import Reports from './pages/Reports';
import CategoryReport from './pages/CategoryReport';
import StudentPromotions from './pages/StudentPromotions';
import CollegeTransfer from './pages/CollegeTransfer';
import TicketManagement from './pages/TicketManagement';
import TaskManagement from './pages/TaskManagement';
import Announcements from './pages/Announcements';
import StudentHistory from './pages/StudentHistory';
import ServicesConfig from './pages/ServicesConfig';
import ServiceRequests from './pages/ServiceRequests';
import CertificateDesigner from './pages/admin/CertificateDesigner';
import CollegeConfiguration from './pages/admin/CollegeConfiguration';
import AddServiceWizard from './pages/admin/AddServiceWizard';
import FacultyManagement from './pages/admin/FacultyManagement';
import AttendanceMonitoring from './pages/admin/AttendanceMonitoring';
import Profile from './pages/Profile';
import ProfileChangeRequests from './pages/admin/ProfileChangeRequests';
import Clubs from './pages/Clubs';
import InternshipAdmin from './internship/InternshipAdmin';


// Student Pages
import StudentDashboard from './pages/student/Dashboard';
import StudentProfile from './pages/student/Profile';
import SemesterRegistration from './pages/student/SemesterRegistration';

import RaiseTicket from './pages/student/RaiseTicket';
import MyTickets from './pages/student/MyTickets';
import StudentAnnouncements from './pages/student/StudentAnnouncements';
import StudentFeedback from './pages/student/StudentFeedback';
import StudentAttendance from './pages/student/Attendance';
import StudentServices from './pages/student/Services';
import StudentClubs from './pages/student/StudentClubs';
import FeeManagement from './pages/student/FeeManagement';
import Transport from './pages/student/Transport';
import InternshipStudent from './internship/InternshipStudent';
import MyProfileRequests from './pages/student/MyProfileRequests';


// Faculty Pages (v2.0)
import FacultyLayout from './components/Layout/FacultyLayout';
import FacultyDashboard from './pages/faculty/Dashboard';
import PostAttendance from './pages/faculty/PostAttendance';
import ContentManage from './pages/faculty/ContentManage';
import FacultyAnnouncements from './pages/faculty/Announcements';
import FacultyStudents from './pages/faculty/Students';
import FacultyChats from './pages/faculty/Chats';
import FacultyTimetable from './pages/faculty/FacultyTimetable';

// Event Pages
import EventCalendar from './pages/admin/EventCalendar';
import StudentCalendar from './pages/student/StudentCalendar';
import StudentTimetable from './pages/student/StudentTimetable';

// Layout
import AdminLayout from './components/Layout/AdminLayout';
import StudentLayout from './components/Layout/StudentLayout';

// Protected Route Component for Admin
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, userType } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" />;
  if (userType === 'student') return <Navigate to="/student/dashboard" />;
  return children;
};

// Protected Route Component for Student
const ProtectedStudentRoute = ({ children }) => {
  const { isAuthenticated, userType } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/student/login" />;
  if (userType === 'admin') return <Navigate to="/" />;
  return children;
};

// Protected Route Component for Faculty (v2.0)
const ProtectedFacultyRoute = ({ children }) => {
  const { isAuthenticated, user } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" />;
  if (user?.role === 'student' || user?.admission_number) return <Navigate to="/student/dashboard" />;
  const isFaculty = user?.role === 'faculty' || user?.role === 'branch_faculty';
  if (!isFaculty) return <Navigate to="/" />;
  return children;
};

import { registerServiceWorker, subscribeUser } from './services/pushService';

function App() {
  const { isAuthenticated, userType } = useAuthStore();

  React.useEffect(() => {
    if (isAuthenticated) {
      const initPush = async () => {
        try {
          const registration = await registerServiceWorker();
          if (registration) {
            // Check permission state before trying to subscribe to avoid prompt if already denied
            if (Notification.permission === 'default' || Notification.permission === 'granted') {
              await subscribeUser(registration);
            }
          }
        } catch (error) {
          console.error('Push initialization failed:', error);
        }
      };
      initPush();
    }
  }, [isAuthenticated]);

  return (
    <Router>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: '#363636',
            color: '#fff',
          },
          success: {
            duration: 3000,
            iconTheme: {
              primary: '#10b981',
              secondary: '#fff',
            },
          },
          error: {
            duration: 4000,
            iconTheme: {
              primary: '#ef4444',
              secondary: '#fff',
            },
          },
        }}
      />

      <Routes>
        {/* Public Routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/student/login" element={<Login />} />
        <Route path="/auth-callback" element={<AuthCallback />} />
        <Route path="/form/:formId" element={<PublicForm />} />

        {/* Protected Admin Routes */}
        <Route
          path="/"
          element={
            isAuthenticated ? (
              userType === 'student' ? (
                <Navigate to="/student/dashboard" replace />
              ) : (
                <AdminLayout />
              )
            ) : (
              <GetStarted />
            )
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="profile" element={<Profile />} />
          <Route path="forms" element={<Forms />} />
          <Route path="forms/new" element={<FormBuilder />} />
          <Route path="forms/edit/:formId" element={<FormBuilder />} />
          <Route path="feedback-forms" element={<FeedbackForms />} />
          <Route path="feedback-forms/new" element={<FeedbackFormBuilder />} />
          <Route path="feedback-forms/edit/:formId" element={<FeedbackFormBuilder />} />
          <Route path="students" element={<Students />} />
          <Route path="students/add" element={<AddStudent />} />
          <Route path="students/self-registration" element={<Submissions />} />
          <Route path="students/profile-change-requests" element={<ProfileChangeRequests />} />
          <Route path="promotions" element={<StudentPromotions />} />
          <Route path="college-transfer" element={<CollegeTransfer />} />
          <Route path="courses" element={<Settings />} />
          <Route path="attendance" element={<Attendance />} />

          <Route path="users" element={<UserManagement />} />
          <Route path="users/field-permissions/:userId" element={<StudentFieldPermissions />} />
          <Route path="reports" element={<Reports />} />
          <Route path="reports/attendance" element={<Reports />} />
          <Route path="reports/day-end" element={<Reports />} />
          <Route path="reports/category" element={<CategoryReport />} />
          <Route path="tickets" element={<TicketManagement />} />
          <Route path="task-management" element={<TaskManagement />} />
          <Route path="announcements" element={<Announcements />} />
          <Route path="student-history" element={<StudentHistory />} />
          <Route path="events" element={<EventCalendar />} />
          <Route path="services/config" element={<ServicesConfig />} />
          <Route path="services/add" element={<AddServiceWizard />} />
          <Route path="services/edit/:id" element={<AddServiceWizard />} />
          <Route path="services/design/:serviceId" element={<CertificateDesigner />} />
          <Route path="college-configuration" element={<CollegeConfiguration />} />
          <Route path="services/requests" element={<ServiceRequests />} />
          <Route path="clubs" element={<Clubs />} />
          <Route path="faculty-management" element={<FacultyManagement />} />
          <Route path="attendance-monitoring" element={<AttendanceMonitoring />} />
          <Route path="internship-management" element={<InternshipAdmin />} />
        </Route>


        {/* Protected Student Routes */}
        <Route
          path="/student"
          element={
            <ProtectedStudentRoute>
              <StudentLayout />
            </ProtectedStudentRoute>
          }
        >
          <Route index element={<Navigate to="/student/dashboard" replace />} />
          <Route path="dashboard" element={<StudentDashboard />} />
          <Route path="profile" element={<StudentProfile />} />

          <Route path="semester-registration" element={<SemesterRegistration />} />
          <Route path="raise-ticket" element={<RaiseTicket />} />
          <Route path="my-tickets" element={<MyTickets />} />
          <Route path="announcements" element={<StudentAnnouncements />} />
          <Route path="events" element={<StudentCalendar />} />
          <Route path="attendance" element={<StudentAttendance />} />
          <Route path="timetable" element={<StudentTimetable />} />
          <Route path="services" element={<StudentServices />} />
          <Route path="clubs" element={<StudentClubs />} />
          <Route path="fees" element={<FeeManagement />} />

          <Route path="transport" element={<Transport />} />
          <Route path="internship" element={<InternshipStudent />} />
          <Route path="feedback" element={<StudentFeedback />} />
          <Route path="profile-requests" element={<MyProfileRequests />} />

        </Route>

        {/* Protected Faculty Routes (v2.0) */}
        <Route
          path="/faculty"
          element={
            <ProtectedFacultyRoute>
              <FacultyLayout />
            </ProtectedFacultyRoute>
          }
        >
          <Route index element={<Navigate to="/faculty/dashboard" replace />} />
          <Route path="dashboard" element={<FacultyDashboard />} />
          <Route path="attendance" element={<PostAttendance />} />
          <Route path="timetable" element={<FacultyTimetable />} />
          <Route path="content" element={<ContentManage />} />
          <Route path="announcements" element={<FacultyAnnouncements />} />
          <Route path="students" element={<FacultyStudents />} />
          <Route path="chats" element={<FacultyChats />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Router>
  );
}

export default App;
