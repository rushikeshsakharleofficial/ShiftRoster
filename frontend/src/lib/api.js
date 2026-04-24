import axios from "axios";

const API_URL = import.meta.env.REACT_APP_BACKEND_URL;
const API = `${API_URL}/api`;

const api = axios.create({
  baseURL: API,
  headers: { "Content-Type": "application/json" },
  withCredentials: true, // Send cookies with every request
});

// Auto-remove Content-Type for FormData so browser sets multipart boundary correctly
api.interceptors.request.use((config) => {
  if (config.data instanceof FormData) {
    delete config.headers["Content-Type"];
  }
  return config;
});

// Interceptor for manual token handling is no longer needed with secure cookies
// Handle 401 - try refresh, then logout
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry && originalRequest.url !== "/auth/login" && originalRequest.url !== "/auth/me") {
      originalRequest._retry = true;
      try {
        // Just call refresh, cookies are handled by browser
        await axios.post(`${API}/auth/refresh`, {}, { withCredentials: true });
        return api(originalRequest);
      } catch {}
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
  uploadAvatar: (id, formData) => api.post(`/users/${id}/avatar`, formData),
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
  extendShift: (data) => api.post("/attendance/extend-shift", data),
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
  testEmail: (recipient_email) => api.post("/organization/test-email", { recipient_email }),
};

// LDAP / Active Directory
export const ldapApi = {
  get: () => api.get("/settings/ldap"),
  update: (data) => api.put("/settings/ldap", data),
  test: (data) => api.post("/settings/ldap/test", data),
  sync: () => api.post("/settings/ldap/sync"),
};

// Announcements
export const announcementsApi = {
  list: () => api.get("/announcements"),
  listActive: () => api.get("/announcements/active"),
  create: (data) => api.post("/announcements", data),
  delete: (id) => api.delete(`/announcements/${id}`),
};

// Holidays
export const holidaysApi = {
  list: () => api.get("/public-holidays"),
  create: (data) => api.post("/public-holidays", data),
};

// Handovers
export const handoversApi = {
  list: () => api.get("/handovers"),
  create: (data) => api.post("/handovers", data),
  complete: (id) => api.post(`/handovers/${id}/complete`),
};

// Tasks
export const tasksApi = {
  list: (params) => api.get("/tasks", { params }),
  create: (data) => api.post("/tasks", data),
  getTask: (id) => api.get(`/tasks/${id}`),
  update: (id, data) => api.put(`/tasks/${id}`, data),
  transfer: (id, data) => api.post(`/tasks/${id}/transfer`, data),
  complete: (id) => api.post(`/tasks/${id}/complete`),
  revert: (id) => api.post(`/tasks/${id}/revert`),
  getPendingCount: () => api.get("/tasks/pending-count"),
  addNote: (id, data) => api.post(`/tasks/${id}/notes`, data),
};

// Chat
export const chatApi = {
  // Channels
  listChannels: () => api.get("/chat/channels"),
  createChannel: (data) => api.post("/chat/channels", data),
  searchChannels: (q) => api.get(`/chat/channels/search?q=${encodeURIComponent(q)}`),
  getChannel: (id) => api.get(`/chat/channels/${id}`),
  joinChannel: (id) => api.post(`/chat/channels/${id}/join`),
  leaveChannel: (id) => api.post(`/chat/channels/${id}/leave`),
  muteChannel: (id, data) => api.post(`/chat/channels/${id}/mute`, data),
  inviteToChannel: (id, data) => api.post(`/chat/channels/${id}/invite`, data),
  getChannelMembers: (id) => api.get(`/chat/channels/${id}/members`),
  getChannelMessages: (id, params) => api.get(`/chat/channels/${id}/messages`, { params }),
  sendChannelMessage: (id, data) => api.post(`/chat/channels/${id}/messages`, data),
  markChannelRead: (id) => api.post(`/chat/channels/${id}/read`),

  // DMs
  listDMs: () => api.get("/chat/dms"),
  openDM: (data) => api.post("/chat/dms", data),
  getDMMessages: (id, params) => api.get(`/chat/dms/${id}/messages`, { params }),
  sendDMMessage: (id, data) => api.post(`/chat/dms/${id}/messages`, data),
  markDMRead: (id) => api.post(`/chat/dms/${id}/read`),

  // Messages
  editMessage: (id, data) => api.put(`/chat/messages/${id}`, data),
  deleteMessage: (id) => api.delete(`/chat/messages/${id}`),
  reactToMessage: (id, data) => api.post(`/chat/messages/${id}/react`, data),

  // Unread + Users
  getUnread: () => api.get("/chat/unread"),
  listUsers: (params) => api.get("/chat/users", { params }),
  mentionUsers: (q) => api.get("/chat/mention-users", { params: { q } }),

  uploadFile: (formData) => api.post("/chat/upload", formData),

  // E2EE key distribution
  updateChannelE2eeKeys: (channelId, keys) => api.put(`/chat/channels/${channelId}/e2ee-keys`, keys),
};

// IAM / Access Rule Book
export const iamApi = {
  listGroups: () => api.get("/iam/groups"),
  createGroup: (data) => api.post("/iam/groups", data),
  updateGroup: (id, data) => api.put(`/iam/groups/${id}`, data),
  deleteGroup: (id) => api.delete(`/iam/groups/${id}`),
  getUserGroups: (userId) => api.get(`/iam/users/${userId}/groups`),
  assignGroups: (userId, groupIds) => api.put(`/iam/users/${userId}/groups`, { group_ids: groupIds }),
  myPermissions: () => api.get("/iam/me/permissions"),
};

// SOPs
export const slackSsoApi = {
  getConfig: () => api.get("/auth/slack/config"),
  loginUrl: () => `${api.defaults.baseURL}/auth/slack/login`,
  getSettings: () => api.get("/organization").then(r => ({ data: r.data.slack_oidc || {} })),
  saveSettings: (data) => api.put("/organization", { slack_oidc: data }),
};

export const googleSsoApi = {
  getConfig: () => api.get("/auth/google/config"),
  loginUrl: () => `${api.defaults.baseURL}/auth/google/login`,
  getSettings: () => api.get("/organization").then(r => ({ data: r.data.google_oidc || {} })),
  saveSettings: (data) => api.put("/organization", { google_oidc: data }),
};

export const sopsApi = {
  list: () => api.get("/sops"),
  create: (data) => api.post("/sops", data),
  get: (id) => api.get(`/sops/${id}`),
  update: (id, data) => api.put(`/sops/${id}`, data),
  delete: (id) => api.delete(`/sops/${id}`),
  approve: (id) => api.put(`/sops/${id}/approve`),
  reject: (id) => api.put(`/sops/${id}/reject`),
  acknowledge: (id) => api.post(`/sops/${id}/acknowledge`),
  transfer: (id, data) => api.post(`/sops/${id}/transfer`, data),
  versions: (id) => api.get(`/sops/${id}/versions`),
  revert: (id, versionId) => api.post(`/sops/${id}/revert/${versionId}`),
  archive: (id) => api.post(`/sops/${id}/archive`),
  upload: (formData) => api.post("/sops/upload", formData),
  setPublishStatus: (id, publish_status) => api.put(`/sops/${id}/publish-status`, { publish_status }),
};

// File Manager
export const filesApi = {
  list: (scope, parentId) => api.get(`/files`, { params: { scope, parent_id: parentId || "" } }),
  createFolder: (data) => api.post(`/files/folder`, data),
  upload: (formData, scope, parentId, onUploadProgress) =>
    api.post(`/files/upload`, formData, {
      params: { scope, parent_id: parentId || "" },
      onUploadProgress,
    }),
  downloadUrl: (id) => `/api/files/${id}/download`,
  previewUrl: (id) => `/api/files/${id}/download?inline=1`,
  rename: (id, name) => api.put(`/files/${id}`, { name }),
  delete: (id) => api.delete(`/files/${id}`),
  move: (id, data) => api.post(`/files/${id}/move`, data),
};

// E2EE key exchange
export const cryptoApi = {
  publishKey: (publicKeyJwk) => api.put("/users/me/public-key", { public_key: publicKeyJwk }),
  getPublicKey: (userId) => api.get(`/users/${userId}/public-key`),
};

// Stories
export const storiesApi = {
  list: () => api.get("/stories"),
  create: (data) => api.post("/stories", data),
  upload: (formData) => api.post("/stories/upload", formData),
  view: (id) => api.post(`/stories/${id}/view`),
  delete: (id) => api.delete(`/stories/${id}`),
};

export default api;
