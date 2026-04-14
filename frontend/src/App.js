import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { Toaster } from "@/components/ui/sonner";
import AppLayout from "@/components/layout/AppLayout";
import LoginPage from "@/pages/LoginPage";
import RegisterPage from "@/pages/RegisterPage";
import DashboardPage from "@/pages/DashboardPage";
import EmployeesPage from "@/pages/EmployeesPage";
import DepartmentsPage from "@/pages/DepartmentsPage";
import ManagerGroupsPage from "@/pages/ManagerGroupsPage";
import ShiftCalendarPage from "@/pages/ShiftCalendarPage";
import LeaveManagementPage from "@/pages/LeaveManagementPage";
import AttendancePage from "@/pages/AttendancePage";
import SwapRequestsPage from "@/pages/SwapRequestsPage";
import NotificationsPage from "@/pages/NotificationsPage";
import ReportsPage from "@/pages/ReportsPage";
import AuditLogPage from "@/pages/AuditLogPage";
import SettingsPage from "@/pages/SettingsPage";

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }
  if (user) return <Navigate to="/" replace />;
  return children;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
          <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
          <Route
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route path="employees" element={<EmployeesPage />} />
            <Route path="departments" element={<DepartmentsPage />} />
            <Route path="manager-groups" element={<ManagerGroupsPage />} />
            <Route path="shifts" element={<ShiftCalendarPage />} />
            <Route path="leave" element={<LeaveManagementPage />} />
            <Route path="attendance" element={<AttendancePage />} />
            <Route path="swap-requests" element={<SwapRequestsPage />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="audit-log" element={<AuditLogPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" />
    </AuthProvider>
  );
}

export default App;
