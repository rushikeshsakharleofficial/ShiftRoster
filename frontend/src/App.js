import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { useEffect, useState } from "react";
import { setupApi } from "@/lib/api";
import AppLayout from "@/components/layout/AppLayout";
import LoginPage from "@/pages/LoginPage";
import SetupPage from "@/pages/SetupPage";
import DashboardPage from "@/pages/DashboardPage";
import ShiftCalendarPage from "@/pages/ShiftCalendarPage";
import EmployeesPage from "@/pages/EmployeesPage";
import DepartmentsPage from "@/pages/DepartmentsPage";
import ManagerGroupsPage from "@/pages/ManagerGroupsPage";
import LeavePage from "@/pages/LeaveManagementPage";
import AttendancePage from "@/pages/AttendancePage";
import SwapRequestsPage from "@/pages/SwapRequestsPage";
import NotificationsPage from "@/pages/NotificationsPage";
import ReportsPage from "@/pages/ReportsPage";
import AuditLogPage from "@/pages/AuditLogPage";
import SettingsPage from "@/pages/SettingsPage";
import StickyNotesPage from "@/pages/StickyNotesPage";
import ShiftTemplatesPage from "@/pages/ShiftTemplatesPage";
import ChatPage from "@/pages/ChatPage";
import { ChatProvider } from "@/contexts/ChatContext";
import { Toaster } from "sonner";
import { Loader2 } from "lucide-react";

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  const [setupChecked, setSetupChecked] = useState(false);
  const [setupRequired, setSetupRequired] = useState(false);

  useEffect(() => {
    setupApi.checkStatus()
      .then(({ data }) => setSetupRequired(!!data.setup_required))
      .catch(() => {})
      .finally(() => setSetupChecked(true));
  }, []);

  if (loading || !setupChecked)
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  if (setupRequired) return <Navigate to="/setup" replace />;
  if (user) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ChatProvider>
        <Routes>
          {/* Public routes */}
          <Route
            path="/login"
            element={
              <PublicRoute>
                <LoginPage />
              </PublicRoute>
            }
          />
          <Route path="/setup" element={<SetupPage />} />

          {/* Protected routes */}
          <Route
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<DashboardPage />} />
            <Route path="/shifts" element={<ShiftCalendarPage />} />
            <Route path="/employees" element={<EmployeesPage />} />
            <Route path="/departments" element={<DepartmentsPage />} />
            <Route path="/manager-groups" element={<ManagerGroupsPage />} />
            <Route path="/leave" element={<LeavePage />} />
            <Route path="/attendance" element={<AttendancePage />} />
            <Route path="/swap-requests" element={<SwapRequestsPage />} />
            <Route path="/sticky-notes" element={<StickyNotesPage />} />
            <Route path="/shift-templates" element={<ShiftTemplatesPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/audit-log" element={<AuditLogPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/chat" element={<ChatPage />} />
          </Route>

          {/* Catch all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Toaster position="top-right" richColors closeButton />
        </ChatProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
