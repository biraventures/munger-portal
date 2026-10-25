"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Eye, Loader2, LogIn, LogOut, ScanFace, Trash2, UserX, X } from "lucide-react";
import { AttendanceHeader } from "@/components/attendance/attendance-header";
import { FaceCaptureDialog } from "@/components/attendance/face-capture-dialog";
import { useAttendanceGuard } from "@/lib/use-attendance-guard";
import { useAttendanceLang } from "@/lib/attendance-i18n";
import { transliterateName } from "@/lib/hindi-name-transliterate";
import type { AttendanceRole } from "@/lib/attendance-auth";
import {
  fetchAttendanceWards,
  fetchWardWorkersToday,
  markStaffAbsent,
  markStaffIn,
  markStaffOut,
  type AttendanceWard,
  type WardWorkerToday,
} from "@/lib/attendance-api";
import {
  fetchEnrolmentPhoto,
  fetchFaceConfig,
  fetchFaceReview,
  fetchFaceSummary,
  fetchPunchPhotos,
  fetchWardFaceEnrolments,
  removeFaceEnrolment,
  reviewFacePunch,
  type FaceEnrolmentStatus,
  type FaceReviewEntry,
  type FaceSummaryWard,
} from "@/lib/face-attendance-api";

const MARK_ROLES: AttendanceRole[] = ["sanitation_prabhari", "apswmo", "attendance_admin"];
const ENROL_ROLES: AttendanceRole[] = ["sanitation_prabhari", "apswmo", "sanitation_officer", "attendance_admin"];
const REVIEW_ROLES: AttendanceRole[] = ["sanitation_officer", "sanitation_prabhari", "apswmo", "attendance_admin"];

type Tab = "mark" | "enrol" | "review" | "summary";

const STRINGS = {
  en: {
    title: "Face Attendance",
    subtitle: "Safai staff attendance with face check and head-turn liveness.",
    off: "Face attendance is not switched on yet on the server. Enrolment and face marking open once it is.",
    tabs: { mark: "Mark attendance", enrol: "Enrol faces", review: "Review", summary: "Ward summary" } as Record<Tab, string>,
    ward: "Ward",
    pickWard: "Select a ward",
    noWorkers: "No active workers in this ward.",
    markIn: "Mark In",
    markOut: "Mark Out",
    absentInformed: "Absent (Informed)",
    absentNotInformed: "Absent (Not Informed)",
    inLabel: "In",
    outLabel: "Out",
    faceBadge: "Face",
    notEnrolled: "Not enrolled",
    enrolledOn: "Enrolled",
    enrol: "Enrol face",
    reEnrol: "Re-enrol",
    remove: "Remove",
    view: "Photo",
    confirmRemove: "Remove this worker's face data? They will be marked by hand until enrolled again.",
    enrolledCount: "enrolled",
    pending: "Manual marks to review",
    rejected: "Failed face checks",
    date: "Date",
    nothing: "Nothing here.",
    accept: "Accept",
    reject: "Reject",
    remarks: "Remarks (required to reject)",
    by: "by",
    reason: "Reason",
    similarity: "Match",
    punchPhoto: "Photo at punch",
    enrolledPhoto: "Enrolled photo",
    noPhoto: "No photo",
    activeStaff: "Staff",
    faceIn: "Face In",
    manualIn: "Manual In",
    failed: "Failed checks",
    close: "Close",
    loading: "Loading...",
  },
  hi: {
    title: "चेहरा हाज़िरी",
    subtitle: "चेहरा जाँच और सिर घुमाने (लाइवनेस) के साथ सफ़ाई कर्मियों की हाज़िरी।",
    off: "सर्वर पर चेहरा हाज़िरी अभी चालू नहीं है। चालू होने पर पंजीकरण और चेहरा मार्किंग खुलेगी।",
    tabs: { mark: "हाज़िरी मार्क करें", enrol: "चेहरा पंजीकरण", review: "समीक्षा", summary: "वार्ड सारांश" } as Record<Tab, string>,
    ward: "वार्ड",
    pickWard: "वार्ड चुनें",
    noWorkers: "इस वार्ड में कोई सक्रिय कर्मचारी नहीं।",
    markIn: "इन मार्क करें",
    markOut: "आउट मार्क करें",
    absentInformed: "अनुपस्थित (सूचित)",
    absentNotInformed: "अनुपस्थित (असूचित)",
    inLabel: "इन",
    outLabel: "आउट",
    faceBadge: "चेहरा",
    notEnrolled: "पंजीकृत नहीं",
    enrolledOn: "पंजीकृत",
    enrol: "चेहरा पंजीकृत करें",
    reEnrol: "पुनः पंजीकरण",
    remove: "हटाएँ",
    view: "फ़ोटो",
    confirmRemove: "इस कर्मचारी का चेहरा डेटा हटाएँ? दोबारा पंजीकरण तक हाज़िरी मैन्युअल होगी।",
    enrolledCount: "पंजीकृत",
    pending: "समीक्षा हेतु मैन्युअल मार्क",
    rejected: "असफल चेहरा जाँच",
    date: "तारीख",
    nothing: "कुछ नहीं।",
    accept: "स्वीकार",
    reject: "अस्वीकार",
    remarks: "टिप्पणी (अस्वीकार हेतु आवश्यक)",
    by: "द्वारा",
    reason: "कारण",
    similarity: "मिलान",
    punchPhoto: "मार्किंग के समय फ़ोटो",
    enrolledPhoto: "पंजीकृत फ़ोटो",
    noPhoto: "फ़ोटो नहीं",
    activeStaff: "कर्मचारी",
    faceIn: "चेहरा इन",
    manualIn: "मैन्युअल इन",
    failed: "असफल जाँच",
    close: "बंद करें",
    loading: "लोड हो रहा है...",
  },
};

function todayIst(): string {
  return new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
}

export default function FaceAttendancePage() {
  const user = useAttendanceGuard([...new Set([...MARK_ROLES, ...ENROL_ROLES, ...REVIEW_ROLES])]);
  const { lang } = useAttendanceLang();
  const s = STRINGS[lang];
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>("mark");
  const [wards, setWards] = useState<AttendanceWard[]>([]);
  const [wardId, setWardId] = useState<number | null>(null);

  useEffect(() => {
    if (!user) return;
    fetchFaceConfig().then((c) => setEnabled(c.enabled));
    fetchAttendanceWards().then(setWards).catch(() => setWards([]));
    setTab(MARK_ROLES.includes(user.role) ? "mark" : ENROL_ROLES.includes(user.role) ? "enrol" : "review");
  }, [user]);

  if (!user) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">{s.loading}</div>;

  const tabs: Tab[] = [
    ...(MARK_ROLES.includes(user.role) ? (["mark"] as Tab[]) : []),
    ...(ENROL_ROLES.includes(user.role) ? (["enrol"] as Tab[]) : []),
    ...(REVIEW_ROLES.includes(user.role) ? (["review", "summary"] as Tab[]) : []),
  ];
  const nameOf = (n: string, hi: string | null) => (lang === "hi" ? hi || transliterateName(n) : n);
  const wardPicker = (
    <label className="mb-4 flex items-center gap-2 text-sm text-slate-700">
      {s.ward}
      <select
        value={wardId ?? ""}
        onChange={(e) => setWardId(e.target.value ? Number(e.target.value) : null)}
        className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
      >
        <option value="">{s.pickWard}</option>
        {wards.map((w) => (
          <option key={w.id} value={w.id}>
            {w.wardName}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <AttendanceHeader user={user} />
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <ScanFace className="h-6 w-6 text-nnm-blue" /> {s.title}
        </h1>
        <p className="mb-5 text-sm text-slate-500">{s.subtitle}</p>
        {enabled === false && (
          <p className="mb-5 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <AlertCircle className="h-4 w-4 shrink-0" /> {s.off}
          </p>
        )}
        <div className="mb-5 flex flex-wrap gap-2" role="tablist">
          {tabs.map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold ${tab === t ? "bg-nnm-blue text-white" : "border border-slate-300 bg-white text-slate-700"}`}
            >
              {s.tabs[t]}
            </button>
          ))}
        </div>

        {tab === "mark" && (
          <>
            {wardPicker}
            {wardId && <MarkTab wardId={wardId} faceOn={enabled === true} s={s} nameOf={nameOf} />}
          </>
        )}
        {tab === "enrol" && (
          <>
            {wardPicker}
            {wardId && enabled && <EnrolTab wardId={wardId} s={s} nameOf={nameOf} />}
          </>
        )}
        {tab === "review" && <ReviewTab s={s} username={user.username} />}
        {tab === "summary" && <SummaryTab s={s} />}
      </main>
    </div>
  );
}

type S = (typeof STRINGS)["en"];
type NameOf = (n: string, hi: string | null) => string;

function ErrorBox({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <div role="alert" className="mb-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
      <AlertCircle className="h-4 w-4 shrink-0" /> {text}
    </div>
  );
}

function MarkTab({ wardId, faceOn, s, nameOf }: { wardId: number; faceOn: boolean; s: S; nameOf: NameOf }) {
  const [workers, setWorkers] = useState<WardWorkerToday[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<number | null>(null);
  const [face, setFace] = useState<{ w: WardWorkerToday; purpose: "in" | "out" } | null>(null);

  const load = useCallback(() => {
    fetchWardWorkersToday(wardId).then(setWorkers).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [wardId]);
  useEffect(() => {
    setWorkers(null);
    load();
  }, [load]);

  async function act(w: WardWorkerToday, kind: "in" | "out" | "ai" | "an") {
    if ((kind === "in" || kind === "out") && faceOn && w.faceEnrolled) {
      setFace({ w, purpose: kind });
      return;
    }
    setActing(w.staffId);
    setError(null);
    try {
      if (kind === "in") await markStaffIn(w.staffId);
      else if (kind === "out") await markStaffOut(w.staffId);
      else await markStaffAbsent(w.staffId, kind === "ai");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setActing(null);
    }
  }

  if (!workers) return <Loader2 className="h-5 w-5 animate-spin text-slate-400" />;
  return (
    <>
      <ErrorBox text={error} />
      {workers.length === 0 && <p className="text-sm text-slate-400">{s.noWorkers}</p>}
      <div className="space-y-3">
        {workers.map((w) => (
          <div key={w.staffId} className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-slate-900">{nameOf(w.name, w.nameHi)}</span>
                {faceOn && w.faceEnrolled && (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-nnm-blue">
                    <ScanFace className="h-3 w-3" /> {s.faceBadge}
                  </span>
                )}
                {w.status && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-600">{w.status.replace(/_/g, " ")}</span>}
              </div>
              <div className="mt-0.5 text-xs text-slate-400">
                {w.shiftName ?? ""}
                {w.inTime && ` - ${s.inLabel}: ${w.inTime}`}
                {w.outTime && ` - ${s.outLabel}: ${w.outTime}`}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {!w.status && (
                <>
                  <button onClick={() => act(w, "in")} disabled={acting === w.staffId} className="inline-flex items-center gap-1.5 rounded-md bg-nnm-blue px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">
                    {acting === w.staffId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogIn className="h-3.5 w-3.5" />} {s.markIn}
                  </button>
                  <button onClick={() => act(w, "ai")} disabled={acting === w.staffId} className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 disabled:opacity-60">
                    <UserX className="h-3.5 w-3.5" /> {s.absentInformed}
                  </button>
                  <button onClick={() => act(w, "an")} disabled={acting === w.staffId} className="inline-flex items-center gap-1.5 rounded-md border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 disabled:opacity-60">
                    <UserX className="h-3.5 w-3.5" /> {s.absentNotInformed}
                  </button>
                </>
              )}
              {(w.status === "present" || w.status === "half_day") && !w.outTime && (
                <button onClick={() => act(w, "out")} disabled={acting === w.staffId} className="inline-flex items-center gap-1.5 rounded-md border border-nnm-blue px-3 py-1.5 text-xs font-semibold text-nnm-blue disabled:opacity-60">
                  <LogOut className="h-3.5 w-3.5" /> {s.markOut}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      {face && (
        <FaceCaptureDialog
          staffId={face.w.staffId}
          staffName={nameOf(face.w.name, face.w.nameHi)}
          purpose={face.purpose}
          onClose={() => {
            setFace(null);
            load();
          }}
          onDone={() => {
            setFace(null);
            load();
          }}
          onManual={async (reason) => {
            if (face.purpose === "in") await markStaffIn(face.w.staffId, reason);
            else await markStaffOut(face.w.staffId, reason);
          }}
        />
      )}
    </>
  );
}

function PhotoModal({ title, photos, onClose, s }: { title: string; photos: { label: string; src: string | null }[]; onClose: () => void; s: S }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-2xl rounded-xl bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          <button onClick={onClose} aria-label={s.close} className="rounded p-1 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {photos.map((p) => (
            <figure key={p.label}>
              {p.src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.src} alt={p.label} className="w-full rounded-md border border-slate-200 object-contain" />
              ) : (
                <div className="flex h-48 items-center justify-center rounded-md border border-dashed border-slate-300 text-xs text-slate-400">{s.noPhoto}</div>
              )}
              <figcaption className="mt-1 text-xs text-slate-500">{p.label}</figcaption>
            </figure>
          ))}
        </div>
      </div>
    </div>
  );
}

function EnrolTab({ wardId, s, nameOf }: { wardId: number; s: S; nameOf: NameOf }) {
  const [rows, setRows] = useState<FaceEnrolmentStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enrolFor, setEnrolFor] = useState<FaceEnrolmentStatus | null>(null);
  const [photo, setPhoto] = useState<{ name: string; src: string | null } | null>(null);

  const load = useCallback(() => {
    fetchWardFaceEnrolments(wardId).then(setRows).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [wardId]);
  useEffect(() => {
    setRows(null);
    load();
  }, [load]);

  async function remove(r: FaceEnrolmentStatus) {
    if (!window.confirm(s.confirmRemove)) return;
    try {
      await removeFaceEnrolment(r.staffId);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (!rows) return <Loader2 className="h-5 w-5 animate-spin text-slate-400" />;
  const done = rows.filter((r) => r.enrolledAt).length;
  return (
    <>
      <ErrorBox text={error} />
      <p className="mb-3 text-sm text-slate-600">
        <b>{done}</b> / {rows.length} {s.enrolledCount}
      </p>
      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
        {rows.map((r) => (
          <div key={r.staffId} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="font-semibold text-slate-900">{nameOf(r.name, r.nameHi)}</div>
              <div className="text-xs text-slate-500">
                {r.enrolledAt ? (
                  <span className="inline-flex items-center gap-1 text-green-700">
                    <CheckCircle2 className="h-3.5 w-3.5" /> {s.enrolledOn} {new Date(r.enrolledAt).toLocaleDateString("en-IN")} {s.by} {r.enrolledBy}
                  </span>
                ) : (
                  s.notEnrolled
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setEnrolFor(r)} className="inline-flex items-center gap-1.5 rounded-md bg-nnm-blue px-3 py-1.5 text-xs font-semibold text-white">
                <ScanFace className="h-3.5 w-3.5" /> {r.enrolledAt ? s.reEnrol : s.enrol}
              </button>
              {r.enrolledAt && (
                <>
                  <button
                    onClick={async () => setPhoto({ name: r.name, src: (await fetchEnrolmentPhoto(r.staffId)).photo })}
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600"
                  >
                    <Eye className="h-3.5 w-3.5" /> {s.view}
                  </button>
                  <button onClick={() => remove(r)} className="inline-flex items-center gap-1.5 rounded-md border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600">
                    <Trash2 className="h-3.5 w-3.5" /> {s.remove}
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
      {enrolFor && (
        <FaceCaptureDialog
          staffId={enrolFor.staffId}
          staffName={nameOf(enrolFor.name, enrolFor.nameHi)}
          purpose="enrol"
          onClose={() => {
            setEnrolFor(null);
            load();
          }}
          onDone={() => {
            setEnrolFor(null);
            load();
          }}
        />
      )}
      {photo && <PhotoModal title={photo.name} photos={[{ label: s.enrolledPhoto, src: photo.src }]} onClose={() => setPhoto(null)} s={s} />}
    </>
  );
}

function ReviewTab({ s, username }: { s: S; username: string }) {
  const [kind, setKind] = useState<"pending" | "rejected">("pending");
  const [date, setDate] = useState<string>("");
  const [rows, setRows] = useState<FaceReviewEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [remarks, setRemarks] = useState<Record<number, string>>({});
  const [photos, setPhotos] = useState<{ title: string; punch: string | null; enrolled: string | null } | null>(null);

  const load = useCallback(() => {
    setRows(null);
    fetchFaceReview(kind, date || undefined).then(setRows).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [kind, date]);
  useEffect(load, [load]);

  async function decide(r: FaceReviewEntry, decision: "accepted" | "rejected") {
    setError(null);
    try {
      await reviewFacePunch(r.id, decision, remarks[r.id]);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(["pending", "rejected"] as const).map((k) => (
          <button key={k} onClick={() => setKind(k)} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${kind === k ? "bg-slate-800 text-white" : "border border-slate-300 bg-white text-slate-700"}`}>
            {k === "pending" ? s.pending : s.rejected}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-1.5 text-xs text-slate-600">
          {s.date}
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1 text-xs" />
        </label>
      </div>
      <ErrorBox text={error} />
      {!rows ? (
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-400">{s.nothing}</p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-semibold text-slate-900">
                    {r.name} <span className="font-normal text-slate-500">- {r.wardName} - {r.date} - {r.action.toUpperCase()}</span>
                  </div>
                  <div className="text-xs text-slate-500">
                    {s.by} {r.markedBy} ({r.markedByRole.replace(/_/g, " ")}) {new Date(r.createdAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })}
                    {r.similarity != null && ` - ${s.similarity} ${(r.similarity * 100).toFixed(0)}%`}
                  </div>
                  <div className="mt-1 text-slate-700">
                    <b>{s.reason}:</b> {r.overrideReason ?? r.rejectReason}
                  </div>
                  {r.reviewStatus !== "pending" && r.reviewStatus !== "none" && (
                    <div className="mt-1 text-xs text-slate-500">
                      {r.reviewStatus} {s.by} {r.reviewedBy} {r.reviewRemarks ? `- ${r.reviewRemarks}` : ""}
                    </div>
                  )}
                </div>
                <button
                  onClick={async () => {
                    const p = await fetchPunchPhotos(r.id);
                    setPhotos({ title: `${r.name} - ${r.date}`, punch: p.photo, enrolled: p.enrolledPhoto });
                  }}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600"
                >
                  <Eye className="h-3.5 w-3.5" /> {s.view}
                </button>
              </div>
              {r.reviewStatus === "pending" && r.markedBy !== username && (
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <input
                    value={remarks[r.id] ?? ""}
                    onChange={(e) => setRemarks({ ...remarks, [r.id]: e.target.value })}
                    placeholder={s.remarks}
                    className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                  />
                  <button onClick={() => decide(r, "accepted")} className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-semibold text-white">
                    {s.accept}
                  </button>
                  <button onClick={() => decide(r, "rejected")} className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white">
                    {s.reject}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {photos && (
        <PhotoModal
          title={photos.title}
          photos={[
            { label: s.punchPhoto, src: photos.punch },
            { label: s.enrolledPhoto, src: photos.enrolled },
          ]}
          onClose={() => setPhotos(null)}
          s={s}
        />
      )}
    </>
  );
}

function SummaryTab({ s }: { s: S }) {
  const [date, setDate] = useState(todayIst());
  const [rows, setRows] = useState<FaceSummaryWard[] | null>(null);
  useEffect(() => {
    setRows(null);
    fetchFaceSummary(date).then((r) => setRows(r.wards)).catch(() => setRows([]));
  }, [date]);
  return (
    <>
      <label className="mb-3 flex items-center gap-2 text-sm text-slate-700">
        {s.date}
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1 text-sm" />
      </label>
      {!rows ? (
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2">{s.ward}</th>
                <th className="px-3 py-2 text-right">{s.activeStaff}</th>
                <th className="px-3 py-2 text-right">{s.enrolledCount}</th>
                <th className="px-3 py-2 text-right">{s.faceIn}</th>
                <th className="px-3 py-2 text-right">{s.manualIn}</th>
                <th className="px-3 py-2 text-right">{s.failed}</th>
              </tr>
            </thead>
            <tbody>
              {rows
                .filter((r) => r.activeStaff > 0)
                .map((r) => (
                  <tr key={r.wardId} className="border-t border-slate-100">
                    <td className="px-3 py-2">{r.wardName}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.activeStaff}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.enrolled}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.faceIn}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.manualIn ? "font-semibold text-amber-700" : ""}`}>{r.manualIn}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.failedAttempts ? "font-semibold text-red-700" : ""}`}>{r.failedAttempts}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
