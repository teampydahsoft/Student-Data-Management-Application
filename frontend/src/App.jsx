import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import useAuthStore from './store/authStore';

// Critical Direct Import for Instant Login Load
import Login from './pages/Login';

// Pages (Lazy Loaded for Fast Route Splitting)
const Dashboard = lazy(() => import('./pages/Dashboard'));
const AuthCallback = lazy(() => import('./pages/AuthCallback'));
const Forms = lazy(() => import('./pages/Forms'));
const FormBuilder = lazy(() => import('./pages/FormBuilder'));
const FeedbackForms = lazy(() => import('./pages/FeedbackForms'));
const FeedbackFormBuilder = lazy(() => import('./pages/FeedbackFormBuilder'));
const Submissions = lazy(() => import('./pages/Submissions'));
const Students = lazy(() => import('./pages/Students'));
const AddStudent = lazy(() => import('./pages/AddStudent'));
const Settings = lazy(() => import('./pages/Settings'));
const PublicForm = lazy(() => import('./pages/PublicForm'));
const Attendance = lazy(() => import('./pages/Attendance'));
const GetStarted = lazy(() => import('./pages/GetStarted'));
const QrStudentView = lazy(() => import('./pages/QrStudentView'));

const UserManagement = lazy(() => import('./pages/UserManagement'));
const StudentFieldPermissions = lazy(() => import('./pages/StudentFieldPermissions'));
const Reports = lazy(() => import('./pages/Reports'));
const CategoryReport = lazy(() => import('./pages/CategoryReport'));
const SmsReport = lazy(() => import('./pages/SmsReport'));
const ScholarshipReport = lazy(() => import('./pages/ScholarshipReport'));
const StudentPromotions = lazy(() => import('./pages/StudentPromotions'));
const PrintIdCards = lazy(() => import('./pages/PrintIdCards'));
const CollegeTransfer = lazy(() => import('./pages/CollegeTransfer'));
const TaskManagement = lazy(() => import('./pages/TaskManagement'));
const Announcements = lazy(() => import('./pages/Announcements'));
const StudentHistory = lazy(() => import('./pages/StudentHistory'));
const SectionPartition = lazy(() => import('./pages/SectionPartition'));
const ServicesConfig = lazy(() => import('./pages/ServicesConfig'));
const ServiceRequests = lazy(() => import('./pages/ServiceRequests'));
const CertificateDesigner = lazy(() => import('./pages/admin/CertificateDesigner'));
const CollegeConfiguration = lazy(() => import('./pages/admin/CollegeConfiguration'));
const AddServiceWizard = lazy(() => import('./pages/admin/AddServiceWizard'));
const FacultyManagement = lazy(() => import('./pages/admin/FacultyManagement'));
const AttendanceMonitoring = lazy(() => import('./pages/admin/AttendanceMonitoring'));
const Profile = lazy(() => import('./pages/Profile'));
const ProfileChangeRequests = lazy(() => import('./pages/admin/ProfileChangeRequests'));
const Clubs = lazy(() => import('./pages/Clubs'));
const InternshipAdmin = lazy(() => import('./internship/InternshipAdmin'));
const CertificateBorrowManagement = lazy(() => import('./pages/admin/CertificateBorrowManagement'));

// Student Pages (Lazy Loaded)
const StudentDashboard = lazy(() => import('./pages/student/Dashboard'));
const StudentProfile = lazy(() => import('./pages/student/Profile'));
const SemesterRegistration = lazy(() => import('./pages/student/SemesterRegistration'));

const TicketAppRedirect = lazy(() => import('./components/student/TicketAppRedirect'));
const StudentAnnouncements = lazy(() => import('./pages/student/StudentAnnouncements'));
const StudentFeedback = lazy(() => import('./pages/student/StudentFeedback'));
const StudentAttendance = lazy(() => import('./pages/student/Attendance'));
const StudentServices = lazy(() => import('./pages/student/Services'));
const StudentClubs = lazy(() => import('./pages/student/StudentClubs'));
const FeeManagement = lazy(() => import('./pages/student/FeeManagement'));
const StudentScholarship = lazy(() => import('./pages/student/StudentScholarship'));
const Transport = lazy(() => import('./pages/student/Transport'));
const InternshipStudent = lazy(() => import('./internship/InternshipStudent'));
const MyProfileRequests = lazy(() => import('./pages/student/MyProfileRequests'));
const MyDocuments = lazy(() => import('./pages/student/MyDocuments'));
const StudentVersantTests = lazy(() => import('./pages/student/VersantTests'));

// Faculty Pages (v2.0, Lazy Loaded)
const FacultyLayout = lazy(() => import('./components/Layout/FacultyLayout'));
const FacultyDashboard = lazy(() => import('./pages/faculty/Dashboard'));
const PostAttendance = lazy(() => import('./pages/faculty/PostAttendance'));
const ContentManage = lazy(() => import('./pages/faculty/ContentManage'));
const FacultyAnnouncements = lazy(() => import('./pages/faculty/Announcements'));
const FacultyStudents = lazy(() => import('./pages/faculty/Students'));
const FacultyChats = lazy(() => import('./pages/faculty/Chats'));
const FacultyTimetable = lazy(() => import('./pages/faculty/FacultyTimetable'));

// Event Pages (Lazy Loaded)
const EventCalendar = lazy(() => import('./pages/admin/EventCalendar'));
const StudentCalendar = lazy(() => import('./pages/student/StudentCalendar'));
const StudentTimetable = lazy(() => import('./pages/student/StudentTimetable'));

// Layout (Lazy Loaded)
const AdminLayout = lazy(() => import('./components/Layout/AdminLayout'));
const StudentLayout = lazy(() => import('./components/Layout/StudentLayout'));
const ParentLayout = lazy(() => import('./components/Layout/ParentLayout'));
const ParentDashboard = lazy(() => import('./pages/parent/Dashboard'));
const ParentProfile = lazy(() => import('./pages/parent/Profile'));
const ParentAttendance = lazy(() => import('./pages/parent/Attendance'));
const ParentIdCard = lazy(() => import('./pages/parent/IdCard'));

// Protected Route Component for Admin
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, userType } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" />;
  if (userType === 'parent') return <Navigate to="/parent/dashboard" replace />;
  if (userType === 'student') return <Navigate to="/student/dashboard" />;
  return children;
};

// Protected Route Component for Student
const ProtectedStudentRoute = ({ children }) => {
  const { isAuthenticated, userType } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/student/login" />;
  if (userType === 'parent') return <Navigate to="/parent/dashboard" replace />;
  if (userType === 'admin') return <Navigate to="/" />;
  return children;
};

const ProtectedParentRoute = ({ children }) => {
  const { isAuthenticated, userType } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/parent/login" />;
  if (userType === 'student') return <Navigate to="/student/dashboard" replace />;
  if (userType === 'admin') return <Navigate to="/" replace />;
  return children;
};

// Protected Route Component for Faculty (v2.0)
const ProtectedFacultyRoute = ({ children }) => {
  const { isAuthenticated, user, userType } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" />;
  if (userType === 'parent' || user?.role === 'parent') return <Navigate to="/parent/profile" replace />;
  if (user?.role === 'student' || user?.admission_number) return <Navigate to="/student/dashboard" />;
  const isFaculty = user?.role === 'faculty' || user?.role === 'branch_faculty';
  if (!isFaculty) return <Navigate to="/" />;
  return children;
};

import { registerServiceWorker, subscribeUser } from './services/pushService';

const RouteLoader = () => (
  <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
    <div className="flex flex-col items-center gap-3">
      <div className="w-10 h-10 border-[3px] border-teal-200 border-t-teal-600 rounded-full animate-spin" />
      <span className="text-sm font-medium text-slate-500">Loading...</span>
    </div>
  </div>
);

function App() {
  const { isAuthenticated, userType } = useAuthStore();

  React.useEffect(() => {
    if (isAuthenticated && userType !== 'parent') {
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
  }, [isAuthenticated, userType]);

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

      <Suspense fallback={<RouteLoader />}>
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/student/login" element={<Login />} />
          <Route path="/parent/login" element={<Login />} />
          <Route path="/auth-callback" element={<AuthCallback />} />
          <Route path="/form/:formId" element={<PublicForm />} />
          <Route path="/qr/:qrToken" element={<QrStudentView />} />

          {/* Protected Admin Routes */}
          <Route
            path="/"
            element={
              isAuthenticated ? (
                userType === 'parent' ? (
                  <Navigate to="/parent/profile" replace />
                ) : userType === 'student' ? (
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
            <Route path="section-partition" element={<SectionPartition />} />
            <Route path="students/section-partition" element={<Navigate to="/section-partition" replace />} />
            <Route path="promotions" element={<StudentPromotions />} />
            <Route path="students/print-id-cards" element={<PrintIdCards />} />
            <Route path="college-transfer" element={<CollegeTransfer />} />
            <Route path="courses" element={<Settings />} />
            <Route path="attendance" element={<Attendance />} />

            <Route path="users" element={<UserManagement />} />
            <Route path="users/field-permissions/:userId" element={<StudentFieldPermissions />} />
            <Route path="reports" element={<Reports />} />
            <Route path="reports/attendance" element={<Reports />} />
            <Route path="reports/day-end" element={<Reports />} />
            <Route path="reports/category" element={<CategoryReport />} />
            <Route path="reports/sms" element={<SmsReport />} />
            <Route path="reports/scholarship" element={<ScholarshipReport />} />
            <Route path="tickets" element={<TicketAppRedirect redirectPath="/task-management" />} />
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
            <Route path="services/borrow-management" element={<CertificateBorrowManagement />} />
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
            <Route path="raise-ticket" element={<TicketAppRedirect />} />
            <Route path="my-tickets" element={<TicketAppRedirect />} />
            <Route path="announcements" element={<StudentAnnouncements />} />
            <Route path="events" element={<StudentCalendar />} />
            <Route path="attendance" element={<StudentAttendance />} />
            <Route path="timetable" element={<StudentTimetable />} />
            <Route path="services" element={<StudentServices />} />
            <Route path="clubs" element={<StudentClubs />} />
            <Route path="fees" element={<FeeManagement />} />
            <Route path="scholarship" element={<StudentScholarship />} />

            <Route path="transport" element={<Transport />} />
            <Route path="internship" element={<InternshipStudent />} />
            <Route path="feedback" element={<StudentFeedback />} />
            <Route path="profile-requests" element={<MyProfileRequests />} />
            <Route path="my-documents" element={<MyDocuments />} />
            <Route path="versant-tests" element={<StudentVersantTests />} />
          </Route>

          {/* Protected Parent Routes */}
          <Route
            path="/parent"
            element={
              <ProtectedParentRoute>
                <ParentLayout />
              </ProtectedParentRoute>
            }
          >
            <Route index element={<Navigate to="/parent/dashboard" replace />} />
            <Route path="dashboard" element={<ParentDashboard />} />
            <Route path="profile" element={<ParentProfile />} />
            <Route path="attendance" element={<ParentAttendance />} />
            <Route path="id-card" element={<ParentIdCard />} />
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
      </Suspense>
    </Router>
  );
}

export default App;
