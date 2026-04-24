import "./App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { useEffect, useState, lazy, Suspense } from "react";
import { setupApi } from "@/lib/api";
import AppLayout from "@/components/layout/AppLayout";
import LoginPage from "@/pages/LoginPage";
import SetupPage from "@/pages/SetupPage";
import SetupPasswordPage from "@/pages/SetupPasswordPage";
import DashboardPage from "@/pages/DashboardPage";
import ShiftCalendarPage from "@/pages/ShiftCalendarPage";
import EmployeesPage from "@/pages/EmployeesPage";
import DepartmentsPage from "@/pages/DepartmentsPage";
import ManagerGroupsPage from "@/pages/ManagerGroupsPage";
import LeavePage from "@/pages/LeaveManagementPage";
import AttendancePage from "@/pages/AttendancePage";
import SwapRequestsPage from "@/pages/SwapRequestsPage";
import NotificationsPage from "@/pages/NotificationsPage";
const ReportsPage = lazy(() => import("@/pages/ReportsPage"));
import AuditLogPage from "@/pages/AuditLogPage";
import SettingsPage from "@/pages/SettingsPage";
import StickyNotesPage from "@/pages/StickyNotesPage";
import ShiftTemplatesPage from "@/pages/ShiftTemplatesPage";
import HandoverPage from "@/pages/HandoverPage";
import TasksPage from "@/pages/TasksPage";
import SOPsPage from "@/pages/SOPsPage";
import SOPEditorPage from "@/pages/SOPEditorPage";
import FileManagerPage from "@/pages/FileManagerPage";
import StoriesPage from "@/pages/StoriesPage";
import ChatPage from "@/pages/ChatPage";
import ChatLayout from "@/components/layout/ChatLayout";
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

function useBrandFavicon() {
  useEffect(() => {
    fetch("/api/public/branding")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        const link = document.getElementById("app-favicon");
        if (link) {
          if (data.logo_url) {
            link.href = data.logo_url;
          } else {
            link.removeAttribute("type");
            link.href = "data:,";
          }
        }
        if (data.brand_name) {
          document.title = data.brand_name;
        }
      })
      .catch(() => {});
  }, []);
}

export default function App() {
  useBrandFavicon();

  // Auto contrast: boost CSS vars on low-DPI screens (non-Retina, standard monitors)
  useEffect(() => {
    function syncDpi() {
      document.documentElement.classList.toggle('low-dpi', window.devicePixelRatio < 1.5);
    }
    syncDpi();
    const mql = window.matchMedia('(min-resolution: 1.5dppx)');
    mql.addEventListener('change', syncDpi);
    return () => mql.removeEventListener('change', syncDpi);
  }, []);

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
          <Route
            path="/setup-password"
            element={
              <PublicRoute>
                <SetupPasswordPage />
              </PublicRoute>
            }
          />

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
            <Route path="/handovers" element={<HandoverPage />} />
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/sops" element={<SOPsPage />} />
            <Route path="/sops/:id" element={<SOPEditorPage />} />
            <Route path="/files" element={<FileManagerPage />} />
            <Route path="/stories" element={<StoriesPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/reports" element={<Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}><ReportsPage /></Suspense>} />
            <Route path="/audit-log" element={<AuditLogPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>

          {/* Standalone Full-Screen Chat */}
          <Route
            element={
              <ProtectedRoute>
                <ChatLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/chat/:channelId" element={<ChatPage />} />
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
