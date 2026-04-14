import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { authApi, formatApiError } from "@/lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    try {
      const { data } = await authApi.me();
      setUser(data);
    } catch {
      setUser(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const login = async (email, password) => {
    const { data } = await authApi.login({ email, password });

    // MFA required — return the MFA data for the login page to handle
    if (data.mfa_required || data.mfa_setup_required) {
      return data;
    }

    if (data.access_token) localStorage.setItem("access_token", data.access_token);
    if (data.refresh_token) localStorage.setItem("refresh_token", data.refresh_token);
    const { access_token, refresh_token, ...userData } = data;
    setUser(userData);
    return userData;
  };

  const completeMfaLogin = (data) => {
    if (data.access_token) localStorage.setItem("access_token", data.access_token);
    if (data.refresh_token) localStorage.setItem("refresh_token", data.refresh_token);
    const { access_token, refresh_token, ...userData } = data;
    setUser(userData);
    return userData;
  };

  const logout = async () => {
    try { await authApi.logout(); } catch {}
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    setUser(false);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, completeMfaLogin, logout, checkAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
