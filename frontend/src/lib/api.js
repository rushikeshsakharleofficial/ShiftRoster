import axios from "axios";

const API_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${API_URL}/api`;

const api = axios.create({
  baseURL: API,
  headers: { "Content-Type": "application/json" },
});

// Add auth token to all requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 - try refresh, then logout
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry && originalRequest.url !== "/auth/login" && originalRequest.url !== "/auth/me") {
      originalRequest._retry = true;
      try {
        const refreshToken = localStorage.getItem("refresh_token");
        if (refreshToken) {
          const { data } = await axios.post(`${API}/auth/refresh`, {}, {
            headers: { Authorization: `Bearer ${refreshToken}` },
          });
          if (data.access_token) {
            localStorage.setItem("access_token", data.access_token);
            originalRequest.headers.Authorization = `Bearer ${data.access_token}`;
            return api(originalRequest);
          }
        }
      } catch {}
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
    }
    return Promise.reject(error);
  }
);

export function formatApiError(detail) {
  if (detail == null) return "Something went wrong. Please try again.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail.map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e))).filter(Boolean).join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}

// Auth
export const authApi = {
  login: (data) => api.post("/auth/login", data),
  logout: () => api.post("/auth/logout"),
  me: () => api.get("/auth/me"),
  refresh: () => api.post("/auth/refresh"),
  // MFA
  verifyMfa: (data) => api.post("/auth/verify-mfa", data),
  setupMfa: (data, mfaToken) => {
    const headers = mfaToken ? { "X-MFA-Token": mfaToken } : {};
    return api.post("/auth/setup-mfa", data, { headers });
  },
  confirmMfa: (data, mfaToken) => {
    const headers = mfaToken ? { "X-MFA-Token": mfaToken } : {};
    return api.post("/auth/confirm-mfa", data, { headers });
  },
  disableMfa: (data) => api.post("/auth/disable-mfa", data),
  generateBackupCodes: () => api.post("/auth/generate-backup-codes"),
};

// Setup (first-time)
export const setupApi = {
  checkStatus: () => api.get("/setup/status"),
  createSuperAdmin: (data) => api.post("/setup", data),
};

// Users
export const usersApi = {
  list: (params) => api.get("/users", { params }),
  create: (data) => api.post("/users", data),
  get: (id) => api.get(`/users/${id}`),
  update: (id, data) => api.put(`/users/${id}`, data),
  delete: (id) => api.delete(`/users/${id}`),
  changeLevel: (id, data) => api.put(`/users/${id}/level`, data),
  mandateMfa: (data) => api.put("/users/mfa/mandate", data),
};

// Departments
export const departmentsApi = {
  list: () => api.get("/departments"),
  create: (data) => api.post("/departments", data),
  update: (id, data) => api.put(`/departments/${id}`, data),
  delete: (id) => api.delete(`/departments/${id}`),
};

// Positions
export const positionsApi = {
  list: () => api.get("/positions"),
  create: (data) => api.post("/positions", data),
  delete: (id) => api.delete(`/positions/${id}`),
};

// Manager Groups
export const managerGroupsApi = {
  list: () => api.get("/manager-groups"),
  create: (data) => api.post("/manager-groups", data),
  update: (id, data) => api.put(`/manager-groups/${id}`, data),
  delete: (id) => api.delete(`/manager-groups/${id}`),
  addMember: (id, data) => api.post(`/manager-groups/${id}/members`, data),
  removeMember: (id, userId) => api.delete(`/manager-groups/${id}/members/${userId}`),
  addDepartment: (id, data) => api.post(`/manager-groups/${id}/departments`, data),
  removeDepartment: (id, deptId) => api.delete(`/manager-groups/${id}/departments/${deptId}`),
};

// Shifts
export const shiftsApi = {
  list: (params) => api.get("/shifts", { params }),
  create: (data) => api.post("/shifts", data),
  get: (id) => api.get(`/shifts/${id}`),
  update: (id, data) => api.put(`/shifts/${id}`, data),
  delete: (id) => api.delete(`/shifts/${id}`),
  move: (id, data) => api.put(`/shifts/${id}/move`, data),
  checkConflicts: (data) => api.post("/shifts/check-conflicts", data),
  createRecurring: (data) => api.post("/shifts/recurring", data),
};

// Shift Templates
export const shiftTemplatesApi = {
  list: () => api.get("/shift-templates"),
  create: (data) => api.post("/shift-templates", data),
  update: (id, data) => api.put(`/shift-templates/${id}`, data),
  delete: (id) => api.delete(`/shift-templates/${id}`),
};

// Shift Assignments
export const assignmentsApi = {
  list: (params) => api.get("/shift-assignments", { params }),
  create: (data) => api.post("/shift-assignments", data),
  delete: (id) => api.delete(`/shift-assignments/${id}`),
};

// Leave
export const leaveApi = {
  list: (params) => api.get("/leave-requests", { params }),
  create: (data) => api.post("/leave-requests", data),
  review: (id, data) => api.put(`/leave-requests/${id}/review`, data),
};

// Availability
export const availabilityApi = {
  list: (params) => api.get("/availability", { params }),
  set: (data) => api.post("/availability", data),
  delete: (id) => api.delete(`/availability/${id}`),
  listBlocks: (params) => api.get("/availability-blocks", { params }),
  createBlock: (data) => api.post("/availability-blocks", data),
};

// Swap Requests
export const swapApi = {
  list: () => api.get("/swap-requests"),
  create: (data) => api.post("/swap-requests", data),
  review: (id, data) => api.put(`/swap-requests/${id}/review`, data),
};

// Calendar Notes
export const calendarNotesApi = {
  list: (params) => api.get("/calendar-notes", { params }),
  create: (data) => api.post("/calendar-notes", data),
  update: (id, data) => api.put(`/calendar-notes/${id}`, data),
  delete: (id) => api.delete(`/calendar-notes/${id}`),
  addReply: (id, data) => api.post(`/calendar-notes/${id}/replies`, data),
};

// Sticky Notes
export const stickyNotesApi = {
  list: (params) => api.get("/sticky-notes", { params }),
  create: (data) => api.post("/sticky-notes", data),
  update: (id, data) => api.put(`/sticky-notes/${id}`, data),
  delete: (id) => api.delete(`/sticky-notes/${id}`),
};

// Attendance
export const attendanceApi = {
  list: (params) => api.get("/attendance", { params }),
  clockIn: (data) => api.post("/attendance/clock-in", data || {}),
  clockOut: () => api.post("/attendance/clock-out"),
};

// Notifications
export const notificationsApi = {
  list: (params) => api.get("/notifications", { params }),
  markRead: (id) => api.put(`/notifications/${id}/read`),
  markAllRead: () => api.put("/notifications/read-all"),
};

// Audit Logs
export const auditApi = {
  list: (params) => api.get("/audit-logs", { params }),
};

// MFA Admin
export const mfaAdminApi = {
  resetUserMfa: (userId) => api.post(`/auth/admin/reset-user-mfa/${userId}`),
  generateBackupCodes: () => api.post("/auth/generate-backup-codes"),
};

// Reports
export const reportsApi = {
  overview: () => api.get("/reports/overview"),
  attendance: (params) => api.get("/reports/attendance", { params }),
  attendanceChart: (params) => api.get("/reports/attendance-chart", { params }),
  shiftCoverage: (params) => api.get("/reports/shift-coverage", { params }),
  departmentBreakdown: () => api.get("/reports/department-breakdown"),
  exportCsv: (type) => api.get(`/reports/export/csv?report_type=${type}`, { responseType: "blob" }),
};

// Manager Nominations
export const nominationsApi = {
  list: () => api.get("/manager-nominations"),
  create: (data) => api.post("/manager-nominations", data),
  review: (id, data) => api.put(`/manager-nominations/${id}/review`, data),
};

// Organization
export const orgApi = {
  get: () => api.get("/organization"),
  update: (data) => api.put("/organization", data),
};

// Holidays
export const holidaysApi = {
  list: () => api.get("/public-holidays"),
  create: (data) => api.post("/public-holidays", data),
};

export default api;
