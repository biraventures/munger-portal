"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, Camera, CheckCircle2, Loader2, LogIn, LogOut, UserX, Lightbulb, Truck } from "lucide-react";
import { AttendanceHeader } from "@/components/attendance/attendance-header";
import { useAttendanceGuard } from "@/lib/use-attendance-guard";
import { useAttendanceLang, type AttendanceLang } from "@/lib/attendance-i18n";
import { transliterateName } from "@/lib/hindi-name-transliterate";
import {
  fetchWardWorkersToday,
  markStaffIn,
  markStaffAbsent,
  markStaffOut,
  uploadWardPhoto,
  fetchWardPhotoToday,
  fetchWardDriversToday,
  markDriverIn,
  markDriverAbsent,
  markDriverOut,
  fetchWardAssistantsToday,
  markAssistantIn,
  markAssistantAbsent,
  markAssistantOut,
  type WardWorkerToday,
  type WardDriverToday,
  type WardAssistantToday,
} from "@/lib/attendance-api";

const STRINGS = {
  en: {
    loading: "Loading...",
    title: "Today's Attendance",
    subtitle: "Mark each worker in as they arrive, or mark them absent.",
    couldNotLoadWorkers: "Could not load the worker list.",
    couldNotLoadTotoDrivers: "Could not load the Toto driver list.",
    couldNotLoadTotoAssistants: "Could not load the Toto assistant list.",
    couldNotMarkIn: "Could not mark in-time.",
    couldNotMarkAbsent: "Could not mark absence.",
    couldNotMarkOut: "Could not mark out-time.",
    cameraPermissionError: "Could not access the camera. Check camera permission for this site.",
    captureError: "Could not capture from the camera.",
    photoUploadFailed: "Photo upload failed.",
    dailyGroupPhoto: "Daily Group Photo",
    uploadedToday: "Uploaded for today.",
    photoInstructions: "One group photo per day for your ward - taken live with the camera, right now. Marking anyone in or absent is unlocked once this is done.",
    openCamera: "Open Camera",
    uploading: "Uploading...",
    captureAndUpload: "Capture & Upload",
    cancel: "Cancel",
    streetlights: "Streetlights",
    streetlightsDesc: "Report a damaged or non-functional streetlight in",
    takePhotoFirst: "Take today's group photo above to see and mark your workers.",
    loadingWorkers: "Loading workers...",
    noWorkers: "No workers on file for your ward yet.",
    noShift: "No shift assigned",
    inLabel: "In",
    outLabel: "Out",
    markIn: "Mark In",
    markOut: "Mark Out",
    absentInformed: "Absent (Informed)",
    absentNotInformed: "Absent (Not Informed)",
    totoHeading: "Toto Vehicle Drivers & Assistants",
    totoSubtitle: "Toto (e-rickshaw) drivers and their assistants in",
    totoSubtitleSuffix: "- marked by you, not the Driver Supervisor.",
    driversHeading: "Drivers",
    assistantsHeading: "Assistants",
    loadingDrivers: "Loading drivers...",
    noTotoDrivers: "No Toto drivers on file for your ward yet.",
    loadingAssistants: "Loading assistants...",
    noTotoAssistants: "No Toto assistants on file for your ward yet.",
    noVehicleNumber: "No vehicle number on file",
    status: {
      present: "Present",
      half_day: "Half Day",
      absent_informed: "Absent (Informed)",
      absent_not_informed: "Absent (Not Informed)",
      absent: "Absent",
    } as Record<string, string>,
  },
  hi: {
    loading: "लोड हो रहा है...",
    title: "आज की हाज़िरी",
    subtitle: "हर कर्मचारी के आने पर उसे इन मार्क करें, या उसे अनुपस्थित मार्क करें।",
    couldNotLoadWorkers: "कर्मचारी सूची लोड नहीं हो सकी।",
    couldNotLoadTotoDrivers: "टोटो ड्राइवर सूची लोड नहीं हो सकी।",
    couldNotLoadTotoAssistants: "टोटो सहायक सूची लोड नहीं हो सकी।",
    couldNotMarkIn: "इन-टाइम मार्क नहीं हो सका।",
    couldNotMarkAbsent: "अनुपस्थिति मार्क नहीं हो सकी।",
    couldNotMarkOut: "आउट-टाइम मार्क नहीं हो सका।",
    cameraPermissionError: "कैमरा एक्सेस नहीं हो सका। इस साइट के लिए कैमरा अनुमति जाँचें।",
    captureError: "कैमरे से फ़ोटो नहीं ली जा सकी।",
    photoUploadFailed: "फ़ोटो अपलोड नहीं हो सकी।",
    dailyGroupPhoto: "दैनिक समूह फ़ोटो",
    uploadedToday: "आज के लिए अपलोड हो गई।",
    photoInstructions: "आपके वार्ड के लिए प्रतिदिन एक समूह फ़ोटो - अभी कैमरे से लाइव ली जाती है। यह होने पर ही किसी को इन या अनुपस्थित मार्क करना खुलता है।",
    openCamera: "कैमरा खोलें",
    uploading: "अपलोड हो रहा है...",
    captureAndUpload: "फ़ोटो लें और अपलोड करें",
    cancel: "रद्द करें",
    streetlights: "स्ट्रीट लाइट्स",
    streetlightsDesc: "में क्षतिग्रस्त या खराब स्ट्रीट लाइट की रिपोर्ट करें।",
    takePhotoFirst: "अपने कर्मचारियों को देखने और मार्क करने के लिए ऊपर आज की समूह फ़ोटो लें।",
    loadingWorkers: "कर्मचारी लोड हो रहे हैं...",
    noWorkers: "आपके वार्ड के लिए अभी कोई कर्मचारी दर्ज नहीं है।",
    noShift: "कोई शिफ्ट निर्धारित नहीं",
    inLabel: "इन",
    outLabel: "आउट",
    markIn: "इन मार्क करें",
    markOut: "आउट मार्क करें",
    absentInformed: "अनुपस्थित (सूचित)",
    absentNotInformed: "अनुपस्थित (असूचित)",
    totoHeading: "टोटो वाहन ड्राइवर और सहायक",
    totoSubtitle: "टोटो (ई-रिक्शा) ड्राइवर और उनके सहायक",
    totoSubtitleSuffix: "में - आपके द्वारा मार्क किए जाते हैं, ड्राइवर सुपरवाइज़र द्वारा नहीं।",
    driversHeading: "ड्राइवर",
    assistantsHeading: "सहायक",
    loadingDrivers: "ड्राइवर लोड हो रहे हैं...",
    noTotoDrivers: "आपके वार्ड के लिए अभी कोई टोटो ड्राइवर दर्ज नहीं है।",
    loadingAssistants: "सहायक लोड हो रहे हैं...",
    noTotoAssistants: "आपके वार्ड के लिए अभी कोई टोटो सहायक दर्ज नहीं है।",
    noVehicleNumber: "कोई वाहन नंबर दर्ज नहीं है",
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

export default function JamadarAttendancePage() {
  const user = useAttendanceGuard(["jamadar"]);
  const { lang } = useAttendanceLang();
  const s = STRINGS[lang];
  const [workers, setWorkers] = useState<WardWorkerToday[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<number | null>(null);

  // Toto vehicle drivers/assistants - marked by the ward Jamadar only (every
  // other vehicle type stays with the Driver Supervisor).
  const [totoDrivers, setTotoDrivers] = useState<WardDriverToday[] | null>(null);
  const [totoAssistants, setTotoAssistants] = useState<WardAssistantToday[] | null>(null);
  const [totoError, setTotoError] = useState<string | null>(null);
  const [totoActingDriverId, setTotoActingDriverId] = useState<number | null>(null);
  const [totoActingAssistantId, setTotoActingAssistantId] = useState<number | null>(null);

  const [photoUploaded, setPhotoUploaded] = useState<boolean | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  async function loadWorkers() {
    if (!user?.wardId) return;
    try {
      const list = await fetchWardWorkersToday(user.wardId);
      setWorkers(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : s.couldNotLoadWorkers);
    }
  }

  async function loadTotoDrivers() {
    if (!user?.wardId) return;
    try {
      const list = await fetchWardDriversToday(user.wardId);
      setTotoDrivers(list);
    } catch (err) {
      setTotoError(err instanceof Error ? err.message : s.couldNotLoadTotoDrivers);
    }
  }

  async function loadTotoAssistants() {
    if (!user?.wardId) return;
    try {
      const list = await fetchWardAssistantsToday(user.wardId);
      setTotoAssistants(list);
    } catch (err) {
      setTotoError(err instanceof Error ? err.message : s.couldNotLoadTotoAssistants);
    }
  }

  async function loadPhotoStatus() {
    if (!user?.wardId) return;
    try {
      const photo = await fetchWardPhotoToday(user.wardId);
      setPhotoUploaded(Boolean(photo));
    } catch {
      setPhotoUploaded(null);
    }
  }

  useEffect(() => {
    if (!user) return;
    loadWorkers();
    loadPhotoStatus();
    loadTotoDrivers();
    loadTotoAssistants();
    // user is stable after the guard resolves - intentionally not re-running on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function handleMarkIn(staffId: number) {
    setActingId(staffId);
    setError(null);
    try {
      await markStaffIn(staffId);
      await loadWorkers();
    } catch (err) {
      setError(err instanceof Error ? err.message : s.couldNotMarkIn);
    } finally {
      setActingId(null);
    }
  }

  async function handleMarkAbsent(staffId: number, informed: boolean) {
    setActingId(staffId);
    setError(null);
    try {
      await markStaffAbsent(staffId, informed);
      await loadWorkers();
    } catch (err) {
      setError(err instanceof Error ? err.message : s.couldNotMarkAbsent);
    } finally {
      setActingId(null);
    }
  }

  async function handleMarkOut(staffId: number) {
    setActingId(staffId);
    setError(null);
    try {
      await markStaffOut(staffId);
      await loadWorkers();
    } catch (err) {
      setError(err instanceof Error ? err.message : s.couldNotMarkOut);
    } finally {
      setActingId(null);
    }
  }

  async function handleMarkTotoDriverIn(driverId: number) {
    setTotoActingDriverId(driverId);
    setTotoError(null);
    try {
      await markDriverIn(driverId);
      await loadTotoDrivers();
    } catch (err) {
      setTotoError(err instanceof Error ? err.message : s.couldNotMarkIn);
    } finally {
      setTotoActingDriverId(null);
    }
  }

  async function handleMarkTotoDriverAbsent(driverId: number, informed: boolean) {
    setTotoActingDriverId(driverId);
    setTotoError(null);
    try {
      await markDriverAbsent(driverId, informed);
      await loadTotoDrivers();
    } catch (err) {
      setTotoError(err instanceof Error ? err.message : s.couldNotMarkAbsent);
    } finally {
      setTotoActingDriverId(null);
    }
  }

  async function handleMarkTotoDriverOut(driverId: number) {
    setTotoActingDriverId(driverId);
    setTotoError(null);
    try {
      await markDriverOut(driverId);
      await loadTotoDrivers();
    } catch (err) {
      setTotoError(err instanceof Error ? err.message : s.couldNotMarkOut);
    } finally {
      setTotoActingDriverId(null);
    }
  }

  async function handleMarkTotoAssistantIn(assistantId: number) {
    setTotoActingAssistantId(assistantId);
    setTotoError(null);
    try {
      await markAssistantIn(assistantId);
      await loadTotoAssistants();
    } catch (err) {
      setTotoError(err instanceof Error ? err.message : s.couldNotMarkIn);
    } finally {
      setTotoActingAssistantId(null);
    }
  }

  async function handleMarkTotoAssistantAbsent(assistantId: number, informed: boolean) {
    setTotoActingAssistantId(assistantId);
    setTotoError(null);
    try {
      await markAssistantAbsent(assistantId, informed);
      await loadTotoAssistants();
    } catch (err) {
      setTotoError(err instanceof Error ? err.message : s.couldNotMarkAbsent);
    } finally {
      setTotoActingAssistantId(null);
    }
  }

  async function handleMarkTotoAssistantOut(assistantId: number) {
    setTotoActingAssistantId(assistantId);
    setTotoError(null);
    try {
      await markAssistantOut(assistantId);
      await loadTotoAssistants();
    } catch (err) {
      setTotoError(err instanceof Error ? err.message : s.couldNotMarkOut);
    } finally {
      setTotoActingAssistantId(null);
    }
  }

  async function handleStartCamera() {
    setCameraError(null);
    try {
      // Rear-facing camera where available (a group photo is normally
      // taken of the workers, not a selfie) - falls back to whatever
      // camera is available on devices with only one.
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      setCameraActive(true);
      // The <video> element only exists once cameraActive is true, so
      // attach the stream on the next tick once it's mounted.
      requestAnimationFrame(() => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      });
    } catch (err) {
      setCameraError(err instanceof Error ? err.message : s.cameraPermissionError);
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraActive(false);
  }

  async function handleCapturePhoto() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    setPhotoError(null);
    setPhotoUploading(true);
    try {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error(s.captureError);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      const base64 = dataUrl.split(",")[1] ?? "";
      await uploadWardPhoto(base64, "image/jpeg");
      setPhotoUploaded(true);
      stopCamera();
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : s.photoUploadFailed);
    } finally {
      setPhotoUploading(false);
    }
  }

  useEffect(() => {
    // Release the camera if the jamadar navigates away mid-capture.
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  if (!user) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">{s.loading}</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AttendanceHeader user={user} />

      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="mb-1 text-2xl font-semibold text-slate-900">{s.title} - {user.wardName}</h1>
        <p className="mb-6 text-sm text-slate-500">{s.subtitle}</p>

        {error && (
          <div role="alert" className="mb-5 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <section className="mb-6 rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Camera className="h-4 w-4" />
            {s.dailyGroupPhoto}
          </h2>
          {photoUploaded === true ? (
            <p className="flex items-center gap-1.5 text-sm text-green-700">
              <CheckCircle2 className="h-4 w-4" />
              {s.uploadedToday}
            </p>
          ) : (
            <>
              <p className="mb-3 text-sm text-slate-500">{s.photoInstructions}</p>

              {!cameraActive ? (
                <button
                  onClick={handleStartCamera}
                  className="inline-flex items-center gap-1.5 rounded-md bg-nnm-blue px-3 py-2 text-sm font-semibold text-white hover:bg-nnm-blue-dark"
                >
                  <Camera className="h-4 w-4" />
                  {s.openCamera}
                </button>
              ) : (
                <div>
                  <video ref={videoRef} autoPlay playsInline muted className="mb-3 w-full max-w-md rounded-md border border-slate-200 bg-black" />
                  <div className="flex gap-2">
                    <button
                      onClick={handleCapturePhoto}
                      disabled={photoUploading}
                      className="inline-flex items-center gap-1.5 rounded-md bg-nnm-blue px-3 py-2 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
                    >
                      {photoUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                      {photoUploading ? s.uploading : s.captureAndUpload}
                    </button>
                    <button
                      onClick={stopCamera}
                      disabled={photoUploading}
                      className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                    >
                      {s.cancel}
                    </button>
                  </div>
                </div>
              )}
              <canvas ref={canvasRef} className="hidden" />

              {cameraError && <p className="mt-2 text-xs text-red-600">{cameraError}</p>}
              {photoError && <p className="mt-2 text-xs text-red-600">{photoError}</p>}
            </>
          )}
        </section>

        <Link
          href="/attendance/report-streetlight-fault"
          className="mb-6 flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-6 transition-shadow hover:shadow-md"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-nnm-blue">
            <Lightbulb className="h-5 w-5" strokeWidth={1.8} />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-slate-800">{s.streetlights}</h2>
            <p className="text-xs text-slate-500">{user.wardName} {s.streetlightsDesc}</p>
          </div>
        </Link>

        {photoUploaded !== true ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-400">
            {s.takePhotoFirst}
          </p>
        ) : !workers ? (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            {s.loadingWorkers}
          </div>
        ) : workers.length === 0 ? (
          <p className="text-sm text-slate-400">{s.noWorkers}</p>
        ) : (
          <div className="space-y-3">
            {workers.map((w) => (
              <div key={w.staffId} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900">{lang === "hi" ? (w.nameHi || transliterateName(w.name)) : w.name}</span>
                    {statusBadge(w.status, lang)}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-400">
                    {w.shiftName ?? s.noShift}
                    {w.inTime && ` - ${s.inLabel}: ${w.inTime}`}
                    {w.outTime && ` - ${s.outLabel}: ${w.outTime}`}
                  </div>
                </div>

                <div className="flex gap-2">
                  {!w.status && (
                    <>
                      <button
                        onClick={() => handleMarkIn(w.staffId)}
                        disabled={actingId === w.staffId}
                        className="inline-flex items-center gap-1.5 rounded-md bg-nnm-blue px-3 py-1.5 text-xs font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
                      >
                        {actingId === w.staffId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogIn className="h-3.5 w-3.5" />}
                        {s.markIn}
                      </button>
                      <button
                        onClick={() => handleMarkAbsent(w.staffId, true)}
                        disabled={actingId === w.staffId}
                        className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                      >
                        <UserX className="h-3.5 w-3.5" />
                        {s.absentInformed}
                      </button>
                      <button
                        onClick={() => handleMarkAbsent(w.staffId, false)}
                        disabled={actingId === w.staffId}
                        className="inline-flex items-center gap-1.5 rounded-md border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
                      >
                        <UserX className="h-3.5 w-3.5" />
                        {s.absentNotInformed}
                      </button>
                    </>
                  )}
                  {w.status && (w.status === "present" || w.status === "half_day") && !w.outTime && (
                    <button
                      onClick={() => handleMarkOut(w.staffId)}
                      disabled={actingId === w.staffId}
                      className="inline-flex items-center gap-1.5 rounded-md border border-nnm-blue px-3 py-1.5 text-xs font-semibold text-nnm-blue hover:bg-blue-50 disabled:opacity-60"
                    >
                      {actingId === w.staffId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
                      {s.markOut}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <h2 className="mb-1 mt-10 flex items-center gap-2 text-lg font-semibold text-slate-900">
          <Truck className="h-5 w-5" />
          {s.totoHeading}
        </h2>
        <p className="mb-4 text-sm text-slate-500">
          {s.totoSubtitle} {user.wardName} {s.totoSubtitleSuffix}
        </p>

        {totoError && (
          <div role="alert" className="mb-5 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {totoError}
          </div>
        )}

        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{s.driversHeading}</h3>
        {!totoDrivers ? (
          <div className="mb-6 flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            {s.loadingDrivers}
          </div>
        ) : totoDrivers.length === 0 ? (
          <p className="mb-6 text-sm text-slate-400">{s.noTotoDrivers}</p>
        ) : (
          <div className="mb-6 space-y-3">
            {totoDrivers.map((d) => (
              <div key={d.driverId} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900">{lang === "hi" ? (d.nameHi || transliterateName(d.name)) : d.name}</span>
                    {statusBadge(d.status, lang)}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-400">
                    {d.vehicleNumber ?? s.noVehicleNumber}
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
                        onClick={() => handleMarkTotoDriverIn(d.driverId)}
                        disabled={totoActingDriverId === d.driverId}
                        className="inline-flex items-center gap-1.5 rounded-md bg-nnm-blue px-3 py-1.5 text-xs font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
                      >
                        {totoActingDriverId === d.driverId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogIn className="h-3.5 w-3.5" />}
                        {s.markIn}
                      </button>
                      <button
                        onClick={() => handleMarkTotoDriverAbsent(d.driverId, true)}
                        disabled={totoActingDriverId === d.driverId}
                        className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                      >
                        <UserX className="h-3.5 w-3.5" />
                        {s.absentInformed}
                      </button>
                      <button
                        onClick={() => handleMarkTotoDriverAbsent(d.driverId, false)}
                        disabled={totoActingDriverId === d.driverId}
                        className="inline-flex items-center gap-1.5 rounded-md border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
                      >
                        <UserX className="h-3.5 w-3.5" />
                        {s.absentNotInformed}
                      </button>
                    </>
                  )}
                  {d.status && (d.status === "present" || d.status === "half_day") && !d.outTime && (
                    <button
                      onClick={() => handleMarkTotoDriverOut(d.driverId)}
                      disabled={totoActingDriverId === d.driverId}
                      className="inline-flex items-center gap-1.5 rounded-md border border-nnm-blue px-3 py-1.5 text-xs font-semibold text-nnm-blue hover:bg-blue-50 disabled:opacity-60"
                    >
                      {totoActingDriverId === d.driverId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
                      {s.markOut}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{s.assistantsHeading}</h3>
        {!totoAssistants ? (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            {s.loadingAssistants}
          </div>
        ) : totoAssistants.length === 0 ? (
          <p className="text-sm text-slate-400">{s.noTotoAssistants}</p>
        ) : (
          <div className="space-y-3">
            {totoAssistants.map((a) => (
              <div key={a.assistantId} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900">{lang === "hi" ? (a.nameHi || transliterateName(a.name)) : a.name}</span>
                    {statusBadge(a.status, lang)}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-400">
                    {a.shiftName ?? s.noShift}
                    {a.inTime && ` - ${s.inLabel}: ${a.inTime}`}
                    {a.outTime && ` - ${s.outLabel}: ${a.outTime}`}
                  </div>
                </div>

                <div className="flex gap-2">
                  {!a.status && (
                    <>
                      <button
                        onClick={() => handleMarkTotoAssistantIn(a.assistantId)}
                        disabled={totoActingAssistantId === a.assistantId}
                        className="inline-flex items-center gap-1.5 rounded-md bg-nnm-blue px-3 py-1.5 text-xs font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
                      >
                        {totoActingAssistantId === a.assistantId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogIn className="h-3.5 w-3.5" />}
                        {s.markIn}
                      </button>
                      <button
                        onClick={() => handleMarkTotoAssistantAbsent(a.assistantId, true)}
                        disabled={totoActingAssistantId === a.assistantId}
                        className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                      >
                        <UserX className="h-3.5 w-3.5" />
                        {s.absentInformed}
                      </button>
                      <button
                        onClick={() => handleMarkTotoAssistantAbsent(a.assistantId, false)}
                        disabled={totoActingAssistantId === a.assistantId}
                        className="inline-flex items-center gap-1.5 rounded-md border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
                      >
                        <UserX className="h-3.5 w-3.5" />
                        {s.absentNotInformed}
                      </button>
                    </>
                  )}
                  {a.status && (a.status === "present" || a.status === "half_day") && !a.outTime && (
                    <button
                      onClick={() => handleMarkTotoAssistantOut(a.assistantId)}
                      disabled={totoActingAssistantId === a.assistantId}
                      className="inline-flex items-center gap-1.5 rounded-md border border-nnm-blue px-3 py-1.5 text-xs font-semibold text-nnm-blue hover:bg-blue-50 disabled:opacity-60"
                    >
                      {totoActingAssistantId === a.assistantId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
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
