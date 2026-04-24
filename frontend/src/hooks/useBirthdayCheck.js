import { useState, useEffect } from "react";

function getTodayMMDD() {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${mm}-${dd}`;
}

function getDismissalKey() {
  return `birthday-dismissed-${new Date().toISOString().slice(0, 10)}`;
}

export function useBirthdayCheck(user) {
  const computeIsBirthday = () => {
    if (!user?.date_of_birth) return false;
    // Support both "YYYY-MM-DD" and "YYYY-MM-DDTHH:MM:SS" formats
    const dobMMDD = user.date_of_birth.slice(5, 10);
    return dobMMDD === getTodayMMDD();
  };

  const computeIsDismissed = () => {
    try {
      return localStorage.getItem(getDismissalKey()) === "1";
    } catch {
      return false;
    }
  };

  const [isBirthday, setIsBirthday] = useState(computeIsBirthday);
  const [isDismissed, setIsDismissed] = useState(computeIsDismissed);

  // Apply/remove "birthday" class on <html> whenever isBirthday changes
  useEffect(() => {
    if (isBirthday) {
      document.documentElement.classList.add("birthday");
    } else {
      document.documentElement.classList.remove("birthday");
    }
    return () => {
      document.documentElement.classList.remove("birthday");
    };
  }, [isBirthday]);

  // Recheck on visibility change and every 15 min (for midnight crossover)
  useEffect(() => {
    const recheck = () => {
      setIsBirthday(computeIsBirthday());
      setIsDismissed(computeIsDismissed());
    };

    const interval = setInterval(recheck, 15 * 60 * 1000);
    document.addEventListener("visibilitychange", recheck);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", recheck);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.date_of_birth]);

  const dismiss = () => {
    try {
      localStorage.setItem(getDismissalKey(), "1");
    } catch {}
    setIsDismissed(true);
  };

  return { isBirthday, isDismissed, dismiss };
}
