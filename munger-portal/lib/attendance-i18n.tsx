"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type AttendanceLang = "en" | "hi";

/**
 * Same key the original attendance-login language toggle used, kept
 * unchanged on purpose - a device that already chose Hindi at login
 * should see Hindi the moment it lands on /attendance/* without the
 * person having to pick again.
 */
const LANG_STORAGE_KEY = "nnm-attendance-login-lang";

function readStoredLang(): AttendanceLang {
  if (typeof window === "undefined") return "en";
  try {
    const saved = window.localStorage.getItem(LANG_STORAGE_KEY);
    if (saved === "en" || saved === "hi") return saved;
  } catch {
    // localStorage unavailable (private browsing, etc.) - default to English, no harm done.
  }
  return "en";
}

interface AttendanceLangContextValue {
  lang: AttendanceLang;
  setLang: (lang: AttendanceLang) => void;
}

const AttendanceLangContext = createContext<AttendanceLangContextValue | null>(null);

/**
 * Wraps every screen that should share one language choice - both the
 * asset-management login page and everything under /attendance/*
 * (via app/attendance/layout.tsx) - so switching the toggle anywhere
 * updates every mounted component at once, and a fresh page load
 * picks up whatever was last chosen on this device.
 */
export function AttendanceLangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<AttendanceLang>("en");

  useEffect(() => {
    setLangState(readStoredLang());

    // Keeps other open tabs in sync too - the storage event only fires
    // in tabs other than the one that made the change, which is
    // exactly the gap a same-tab React state update doesn't cover.
    function onStorage(e: StorageEvent) {
      if (e.key === LANG_STORAGE_KEY && (e.newValue === "en" || e.newValue === "hi")) {
        setLangState(e.newValue);
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  function setLang(next: AttendanceLang) {
    setLangState(next);
    try {
      window.localStorage.setItem(LANG_STORAGE_KEY, next);
    } catch {
      // Not persisted this time, but the toggle still works for the current visit.
    }
  }

  return <AttendanceLangContext.Provider value={{ lang, setLang }}>{children}</AttendanceLangContext.Provider>;
}

/**
 * Reads the shared language choice. Must be called under
 * AttendanceLangProvider (the attendance-login page and the
 * /attendance/* layout both provide it) - throws loudly instead of
 * silently defaulting to English, so a page that forgets to render
 * inside the provider is caught in development rather than shipping
 * a page that quietly ignores the toggle.
 */
export function useAttendanceLang(): AttendanceLangContextValue {
  const ctx = useContext(AttendanceLangContext);
  if (!ctx) {
    throw new Error("useAttendanceLang() must be used within an AttendanceLangProvider");
  }
  return ctx;
}

/** Small helper so every page's STRINGS dictionary is typed the same way: one record per language, same key shape. */
export function t<T extends Record<string, string>>(dict: Record<AttendanceLang, T>, lang: AttendanceLang): T {
  return dict[lang];
}
