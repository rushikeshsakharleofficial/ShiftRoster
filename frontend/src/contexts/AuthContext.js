import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { authApi, cryptoApi, formatApiError } from "@/lib/api";
import { initCrypto } from "@/lib/crypto";
import { applyAccentColor, applyStoredAccentColor, getRandomAccentId } from "@/lib/accent-colors";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    try {
      const { data } = await authApi.me();
      setUser(data);
      const colorId = data?.accent_color || (() => {
        const stored = localStorage.getItem("accent_color");
        if (stored) return stored;
        const r = getRandomAccentId();
        localStorage.setItem("accent_color", r);
        return r;
      })();
      applyAccentColor(colorId);
      if (data?.id) {
        // forcePub=true when server has no public_key yet (catches publish-failed-on-first-gen)
        initCrypto(data.id, (jwk) => cryptoApi.publishKey(jwk), !data.public_key).catch(console.error);
      }
    } catch {
      setUser(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const login = async (email, password, rememberMe = false) => {
    const { data } = await authApi.login({ email, password, remember_me: rememberMe });

    // MFA required — return the MFA data for the login page to handle
    if (data.mfa_required || data.mfa_setup_required) {
      return data;
    }

    setUser(data);
    const colorId = data?.accent_color || (() => {
      const stored = localStorage.getItem("accent_color");
      if (stored) return stored;
      const r = getRandomAccentId();
      localStorage.setItem("accent_color", r);
      return r;
    })();
    applyAccentColor(colorId);
    if (data?.id) {
      initCrypto(data.id, (jwk) => cryptoApi.publishKey(jwk), !data.public_key).catch(console.error);
    }
    return data;
  };

  const completeMfaLogin = (data) => {
    setUser(data);
    const colorId = data?.accent_color || (() => {
      const stored = localStorage.getItem("accent_color");
      if (stored) return stored;
      const r = getRandomAccentId();
      localStorage.setItem("accent_color", r);
      return r;
    })();
    applyAccentColor(colorId);
    if (data?.id) {
      initCrypto(data.id, (jwk) => cryptoApi.publishKey(jwk), !data.public_key).catch(console.error);
    }
    return data;
  };

  const logout = async () => {
    try { await authApi.logout(); } catch {}
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
