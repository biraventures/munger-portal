"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, Loader2, LogIn, LogOut, UserX, Users, BookOpen } from "lucide-react";
import { AttendanceHeader } from "@/components/attendance/attendance-header";
import { useAttendanceGuard } from "@/lib/use-attendance-guard";
import { useAttendanceLang, type AttendanceLang } from "@/lib/attendance-i18n";
import { transliterateName } from "@/lib/hindi-name-transliterate";
import { fetchWardDriversToday, markDriverIn, markDriverAbsent, markDriverOut, type WardDriverToday } from "@/lib/attendance-api";

const STRINGS = {
  en: {
    assistantAttendance: "Assistant Attendance",
    vehicleLogbook: "Vehicle Logbook",
    title: "Today's Driver Attendance",
    subtitle: "Mark each driver in as they arrive, or mark them absent.",
    loadingDrivers: "Loading drivers...",
    noDrivers: "No drivers on file for your ward yet.",
    noVehicle: "No vehicle on file",
    noShift: "No shift assigned",
    inLabel: "In",
    outLabel: "Out",
    markIn: "Mark In",
    markOut: "Mark Out",
    absentInformed: "Absent (Informed)",
    absentNotInformed: "Absent (Not Informed)",
    loading: "Loading...",
    couldNotLoad: "Could not load the driver list.",
    couldNotMarkIn: "Could not mark in-time.",
    couldNotMarkAbsent: "Could not mark absence.",
    couldNotMarkOut: "Could not mark out-time.",
    status: {
      present: "Present",
      half_day: "Half Day",
      absent_informed: "Absent (Informed)",
      absent_not_informed: "Absent (Not Informed)",
      absent: "Absent",
    } as Record<string, string>,
  },
  hi: {
    assistantAttendance: "सहायक हाज़िरी",
    vehicleLogbook: "वाहन लॉगबुक",
    title: "आज की ड्राइवर हाज़िरी",
    subtitle: "हर ड्राइवर के आने पर उसे इन मार्क करें, या उसे अनुपस्थित मार्क करें।",
    loadingDrivers: "ड्राइवर लोड हो रहे हैं...",
    noDrivers: "आपके वार्ड के लिए अभी कोई ड्राइवर दर्ज नहीं है।",
    noVehicle: "कोई वाहन दर्ज नहीं है",
    noShift: "कोई शिफ्ट निर्धारित नहीं",
    inLabel: "इन",
    outLabel: "आउट",
    markIn: "इन मार्क करें",
    markOut: "आउट मार्क करें",
    absentInformed: "अनुपस्थित (सूचित)",
    absentNotInformed: "अनुपस्थित (असूचित)",
    loading: "लोड हो रहा है...",
    couldNotLoad: "ड्राइवर सूची लोड नहीं हो सकी।",
    couldNotMarkIn: "इन-टाइम मार्क नहीं हो सका।",
    couldNotMarkAbsent: "अनुपस्थिति मार्क नहीं हो सकी।",
    couldNotMarkOut: "आउट-टाइम मार्क नहीं हो सका।",
    status: {
      present: "उपस्थित",
      half_day: "हाफ डे",
      absent_informed: "अनुपस्थित (सूचित)",
      absent_not_informed: "अनुपस्थित (असूचित)",
      absent: "अनुपस्थित",
    } as Record<string, string>,
  },
};

function statusBadge(status: string | null, lang: AttendanceLang) {
  if (!status) return null;
  const s = STRINGS[lang];
  const classMap: Record<string, string> = {
    present: "bg-green-100 text-green-700",
    half_day: "bg-amber-100 text-amber-700",
    absent_informed: "bg-slate-200 text-slate-700",
    absent_not_informed: "bg-red-100 text-red-700",
    absent: "bg-red-100 text-red-700",
  };
  const label = s.status[status];
  const className = classMap[status];
  if (!label || !className) return null;
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${className}`}>
      {label}
    </span>
  );
}

export default function DriverSupervisorAttendancePage() {
  const user = useAttendanceGuard(["driver_supervisor"]);
  const { lang } = useAttendanceLang();
  const s = STRINGS[lang];
  const [drivers, setDrivers] = useState<WardDriverToday[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<number | null>(null);

  async function loadDrivers() {
    if (!user?.wardId) return;
    try {
      const list = await fetchWardDriversToday(user.wardId);
      setDrivers(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : s.couldNotLoad);
    }
  }

  useEffect(() => {
    if (!user) return;
    loadDrivers();
    // user is stable after the guard resolves - intentionally not re-running on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function handleMarkIn(driverId: number) {
    setActingId(driverId);
    setError(null);
    try {
      await markDriverIn(driverId);
      await loadDrivers();
    } catch (err) {
      setError(err instanceof Error ? err.message : s.couldNotMarkIn);
    } finally {
      setActingId(null);
    }
  }

  async function handleMarkAbsent(driverId: number, informed: boolean) {
    setActingId(driverId);
    setError(null);
    try {
      await markDriverAbsent(driverId, informed);
      await loadDrivers();
    } catch (err) {
      setError(err instanceof Error ? err.message : s.couldNotMarkAbsent);
    } finally {
      setActingId(null);
    }
  }

  async function handleMarkOut(driverId: number) {
    setActingId(driverId);
    setError(null);
    try {
      await markDriverOut(driverId);
      await loadDrivers();
    } catch (err) {
      setError(err instanceof Error ? err.message : s.couldNotMarkOut);
    } finally {
      setActingId(null);
    }
  }

  if (!user) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">{s.loading}</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AttendanceHeader user={user} />

      <main className="mx-auto max-w-3xl px-6 py-10">
        <div className="mb-1 flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-slate-900">{s.title} - {user.wardName}</h1>
          <div className="flex items-center gap-4">
            <Link href="/attendance/assistants" className="inline-flex items-center gap-1.5 text-sm font-medium text-nnm-blue hover:underline">
              <Users className="h-4 w-4" />
              {s.assistantAttendance}
            </Link>
            <Link href="/attendance/manage-assets" className="inline-flex items-center gap-1.5 text-sm font-medium text-nnm-blue hover:underline">
              <BookOpen className="h-4 w-4" />
              {s.vehicleLogbook}
            </Link>
          </div>
        </div>
        <p className="mb-6 text-sm text-slate-500">{s.subtitle}</p>

        {error && (
          <div role="alert" className="mb-5 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {!drivers ? (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            {s.loadingDrivers}
          </div>
        ) : drivers.length === 0 ? (
          <p className="text-sm text-slate-400">{s.noDrivers}</p>
        ) : (
          <div className="space-y-3">
            {drivers.map((d) => (
              <div key={d.driverId} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900">{lang === "hi" ? (d.nameHi || transliterateName(d.name)) : d.name}</span>
                    {statusBadge(d.status, lang)}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-400">
                    {d.vehicleNumber ?? s.noVehicle}
                    {" - "}
                    {d.shiftName ?? s.noShift}
                    {d.inTime && ` - ${s.inLabel}: ${d.inTime}`}
                    {d.outTime && ` - ${s.outLabel}: ${d.outTime}`}
                  </div>
                </div>

                <div className="flex gap-2">
                  {!d.status && (
                    <>
                      <button
                        onClick={() => handleMarkIn(d.driverId)}
                        disabled={actingId === d.driverId}
                        className="inline-flex items-center gap-1.5 rounded-md bg-nnm-blue px-3 py-1.5 text-xs font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
                      >
                        {actingId === d.driverId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogIn className="h-3.5 w-3.5" />}
                        {s.markIn}
                      </button>
                      <button
                        onClick={() => handleMarkAbsent(d.driverId, true)}
                        disabled={actingId === d.driverId}
                        className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                      >
                        <UserX className="h-3.5 w-3.5" />
                        {s.absentInformed}
                      </button>
                      <button
                        onClick={() => handleMarkAbsent(d.driverId, false)}
                        disabled={actingId === d.driverId}
                        className="inline-flex items-center gap-1.5 rounded-md border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
                      >
                        <UserX className="h-3.5 w-3.5" />
                        {s.absentNotInformed}
                      </button>
                    </>
                  )}
                  {d.status && (d.status === "present" || d.status === "half_day") && !d.outTime && (
                    <button
                      onClick={() => handleMarkOut(d.driverId)}
                      disabled={actingId === d.driverId}
                      className="inline-flex items-center gap-1.5 rounded-md border border-nnm-blue px-3 py-1.5 text-xs font-semibold text-nnm-blue hover:bg-blue-50 disabled:opacity-60"
                    >
                      {actingId === d.driverId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
                      {s.markOut}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
