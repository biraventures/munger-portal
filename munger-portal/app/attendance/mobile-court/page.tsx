"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { AttendanceHeader } from "@/components/attendance/attendance-header";
import { useAttendanceGuard } from "@/lib/use-attendance-guard";
import { call, type MikingVideo, type MobileCourtCaseSummary } from "@/lib/enforcement-api";
import { Card, ErrorLine, GpsField, MediaUpload, MediaView, StatusPill, STATUS_LABELS, fmtDate, fmtDateTime, inputClass, labelClass, primaryBtn } from "@/components/enforcement/parts";

const ROLES = ["apswmo", "mobile_court_staff", "city_manager", "municipal_commissioner", "deputy_municipal_commissioner"] as const;

export default function MobileCourtPage() {
  const user = useAttendanceGuard([...ROLES]);
  const [tab, setTab] = useState<"cases" | "videos">("cases");
  const [types, setTypes] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [cases, setCases] = useState<MobileCourtCaseSummary[] | null>(null);
  const [videos, setVideos] = useState<MikingVideo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const canWrite = user?.role === "apswmo" || user?.role === "mobile_court_staff";

  const load = useCallback(async () => {
    try {
      const p = new URLSearchParams({ status, q });
      const [c, v] = await Promise.all([
        call<{ cases: MobileCourtCaseSummary[] }>("GET", `/mobile-court/cases?${p}`),
        call<{ videos: MikingVideo[] }>("GET", "/mobile-court/miking-videos"),
      ]);
      setCases(c.cases);
      setVideos(v.videos);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load.");
    }
  }, [status, q]);

  useEffect(() => { if (user) { load(); call<{ violationTypes: string[] }>("GET", "/mobile-court/options").then((o) => setTypes(o.violationTypes)).catch(() => {}); } }, [user, load]);

  if (!user) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading...</div>;

  return (
    <div className="min-h-screen bg-slate-50">
      <AttendanceHeader user={user} />
      <main className="mx-auto max-w-4xl space-y-5 px-4 py-8">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold text-slate-900">Mobile Court</h1>
          {canWrite && tab === "cases" && <button className={primaryBtn} onClick={() => setShowForm((v) => !v)}><Plus className="h-4 w-4" /> Record violation</button>}
        </div>
        <div className="flex gap-2">
          {([["cases", "Cases"], ["videos", "Miking videos"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${tab === k ? "bg-nnm-blue text-white" : "border border-slate-300 bg-white text-slate-600"}`}>{l}</button>
          ))}
        </div>
        <ErrorLine message={error} />

        {tab === "cases" ? (
          <>
            {showForm && canWrite && <NewViolation types={types} onDone={() => { setShowForm(false); load(); }} />}
            <div className="flex flex-wrap gap-2">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search case no., name, phone, place" className={`${inputClass} flex-1`} />
              <select value={status} onChange={(e) => setStatus(e.target.value)} className={`${inputClass} w-auto`}>
                <option value="">All statuses</option>
                {["recorded", "noticed", "complied", "violated_again", "fined", "closed"].map((k) => <option key={k} value={k}>{STATUS_LABELS[k] ?? k}</option>)}
              </select>
            </div>
            {!cases ? <p className="text-sm text-slate-400">Loading...</p> : cases.length === 0 ? <p className="text-sm text-slate-500">No cases found.</p> : (
              <ul className="space-y-2">
                {cases.map((c) => (
                  <li key={c.id}>
                    <Link href={`/attendance/mobile-court/${c.id}`} className="block rounded-xl border border-slate-200 bg-white p-4 hover:border-nnm-blue">
                      <div className="flex items-center justify-between gap-2"><span className="font-mono text-sm font-semibold">{c.case_no}</span><StatusPill status={c.status} /></div>
                      <div className="mt-1 text-sm text-slate-700">{c.violator_name} - {c.violator_phone}</div>
                      <div className="text-xs text-slate-500">{c.violation_type} - {c.location_text} - {fmtDateTime(c.created_at)}</div>
                      {c.rectify_by && c.status === "noticed" && <div className="mt-1 text-xs text-amber-700">Rectify by {fmtDate(c.rectify_by)}</div>}
                      {c.fine_status && <div className="mt-1 text-xs text-red-700">Fine {c.fine_status}</div>}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <Videos videos={videos} canWrite={canWrite} onDone={load} />
        )}
      </main>
    </div>
  );
}

function NewViolation({ types, onDone }: { types: string[]; onDone: () => void }) {
  const [f, setF] = useState({ violatorName: "", violatorPhone: "", violatorEmail: "", violationType: "", description: "", ward: "", locationText: "" });
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [photo, setPhoto] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!gps) { setError("Capture the GPS location."); return; }
    setBusy(true);
    setError(null);
    try {
      await call("POST", "/mobile-court/cases", { ...f, description: f.description || null, ward: f.ward || null, latitude: gps.lat, longitude: gps.lng, evidenceMediaId: photo });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally { setBusy(false); }
  }
  return (
    <Card title="Record violation">
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <div><label className={labelClass}>Violator name</label><input required value={f.violatorName} onChange={set("violatorName")} className={inputClass} /></div>
        <div><label className={labelClass}>Phone</label><input required inputMode="tel" value={f.violatorPhone} onChange={set("violatorPhone")} className={inputClass} /></div>
        <div><label className={labelClass}>Email</label><input required type="email" value={f.violatorEmail} onChange={set("violatorEmail")} className={inputClass} /></div>
        <div><label className={labelClass}>Type of violation</label>
          <select required value={f.violationType} onChange={set("violationType")} className={inputClass}><option value="">Select...</option>{types.map((t) => <option key={t}>{t}</option>)}</select></div>
        <div><label className={labelClass}>Ward (optional)</label><input value={f.ward} onChange={set("ward")} className={inputClass} /></div>
        <div><label className={labelClass}>Location / landmark</label><input required value={f.locationText} onChange={set("locationText")} className={inputClass} /></div>
        <div className="sm:col-span-2"><label className={labelClass}>Details (optional)</label><textarea rows={2} value={f.description} onChange={set("description")} className={inputClass} /></div>
        <div className="sm:col-span-2"><GpsField lat={gps?.lat ?? null} lng={gps?.lng ?? null} onChange={(lat, lng) => setGps({ lat, lng })} /></div>
        <div className="sm:col-span-2"><MediaUpload label="Photo evidence" module="mobile_court" purpose="violation_evidence" accept="image/*" lat={gps?.lat} lng={gps?.lng} onUploaded={(m) => setPhoto(m ? m.id : null)} /></div>
        <div className="sm:col-span-2"><button disabled={busy} className={primaryBtn}>{busy ? "Saving..." : "Save"}</button><ErrorLine message={error} /></div>
      </form>
    </Card>
  );
}

function Videos({ videos, canWrite, onDone }: { videos: MikingVideo[] | null; canWrite: boolean; onDone: () => void }) {
  const [f, setF] = useState({ title: "", areaText: "", ward: "", recordedOn: new Date().toISOString().slice(0, 10), messageText: "" });
  const [media, setMedia] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!media) return;
    setBusy(true);
    setError(null);
    try {
      await call("POST", "/mobile-court/miking-videos", { ...f, ward: f.ward || null, messageText: f.messageText || null, mediaId: media });
      setF({ ...f, title: "", areaText: "", messageText: "" });
      setMedia(null);
      onDone();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save."); } finally { setBusy(false); }
  }
  return (
    <>
      {canWrite && (
        <Card title="Add miking video">
          <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
            <div><label className={labelClass}>Title</label><input required value={f.title} onChange={set("title")} className={inputClass} /></div>
            <div><label className={labelClass}>Area covered</label><input required value={f.areaText} onChange={set("areaText")} className={inputClass} /></div>
            <div><label className={labelClass}>Ward (optional)</label><input value={f.ward} onChange={set("ward")} className={inputClass} /></div>
            <div><label className={labelClass}>Date recorded</label><input required type="date" value={f.recordedOn} onChange={set("recordedOn")} className={inputClass} /></div>
            <div className="sm:col-span-2"><label className={labelClass}>Message announced (optional)</label><textarea rows={2} value={f.messageText} onChange={set("messageText")} className={inputClass} /></div>
            <div className="sm:col-span-2"><MediaUpload key={String(videos?.length)} required label="Miking video" module="mobile_court" purpose="miking_video" accept="video/*" onUploaded={(m) => setMedia(m ? m.id : null)} /></div>
            <div className="sm:col-span-2"><button disabled={busy || !media} className={primaryBtn}>Save video</button><ErrorLine message={error} /></div>
          </form>
        </Card>
      )}
      {!videos ? <p className="text-sm text-slate-400">Loading...</p> : videos.length === 0 ? <p className="text-sm text-slate-500">No miking videos yet.</p> : (
        <div className="grid gap-3 sm:grid-cols-2">
          {videos.map((v) => (
            <Card key={v.id} title={v.title}>
              <p className="mb-2 text-xs text-slate-500">{v.area_text}{v.ward ? `, ${v.ward}` : ""} - {fmtDate(v.recorded_on)} - {v.uploaded_by_name}</p>
              <MediaView link={v.link} kind="video" label={v.message_text ?? "Miking video"} />
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
