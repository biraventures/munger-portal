"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { AttendanceHeader } from "@/components/attendance/attendance-header";
import { useAttendanceGuard } from "@/lib/use-attendance-guard";
import { call, type EncroachmentCaseSummary } from "@/lib/enforcement-api";
import { Card, ErrorLine, GpsField, MediaUpload, StatusPill, fmtDateTime, inputClass, labelClass, primaryBtn, STATUS_LABELS } from "@/components/enforcement/parts";

const ROLES = ["city_manager", "encroachment_staff", "municipal_commissioner", "deputy_municipal_commissioner"] as const;

export default function EncroachmentListPage() {
  const user = useAttendanceGuard([...ROLES]);
  const [kind, setKind] = useState<"temporary" | "permanent">("temporary");
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [cases, setCases] = useState<EncroachmentCaseSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const canWrite = user?.role === "city_manager" || user?.role === "encroachment_staff";

  const load = useCallback(async () => {
    try {
      const p = new URLSearchParams({ kind, status, q });
      setCases((await call<{ cases: EncroachmentCaseSummary[] }>("GET", `/encroachment/cases?${p}`)).cases);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load cases.");
    }
  }, [kind, status, q]);

  useEffect(() => { if (user) load(); }, [user, load]);

  if (!user) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading...</div>;

  return (
    <div className="min-h-screen bg-slate-50">
      <AttendanceHeader user={user} />
      <main className="mx-auto max-w-4xl space-y-5 px-4 py-8">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold text-slate-900">Encroachment Removal</h1>
          {canWrite && <button className={primaryBtn} onClick={() => setShowForm((v) => !v)}><Plus className="h-4 w-4" /> New case</button>}
        </div>

        {showForm && canWrite && <NewCase defaultKind={kind} onDone={() => { setShowForm(false); load(); }} />}

        <div className="flex gap-2">
          {(["temporary", "permanent"] as const).map((k) => (
            <button key={k} onClick={() => setKind(k)} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${kind === k ? "bg-nnm-blue text-white" : "bg-white text-slate-600 border border-slate-300"}`}>
              {k === "temporary" ? "Temporary" : "Permanent"}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search case no., name, phone, place" className={`${inputClass} flex-1`} />
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={`${inputClass} w-auto`}>
            <option value="">All statuses</option>
            {Object.entries(STATUS_LABELS).filter(([k]) => !["recorded", "noticed", "complied", "violated_again", "fined"].includes(k)).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <ErrorLine message={error} />
        {!cases ? <p className="text-sm text-slate-400">Loading...</p> : cases.length === 0 ? <p className="text-sm text-slate-500">No cases found.</p> : (
          <ul className="space-y-2">
            {cases.map((c) => (
              <li key={c.id}>
                <Link href={`/attendance/encroachment/${c.id}`} className="block rounded-xl border border-slate-200 bg-white p-4 hover:border-nnm-blue">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm font-semibold">{c.case_no}</span>
                    <StatusPill status={c.status} />
                  </div>
                  <div className="mt-1 text-sm text-slate-700">{c.encroacher_name} - {c.encroacher_phone}</div>
                  <div className="text-xs text-slate-500">{c.location_text}{c.ward ? `, ${c.ward}` : ""} - {fmtDateTime(c.created_at)}</div>
                  {c.deadline_at && c.status === "notice_served" && <div className="mt-1 text-xs text-amber-700">Deadline {fmtDateTime(c.deadline_at)}</div>}
                  {c.fine_status && <div className="mt-1 text-xs text-red-700">Fine {c.fine_status}</div>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

function NewCase({ defaultKind, onDone }: { defaultKind: "temporary" | "permanent"; onDone: () => void }) {
  const [kind, setKind] = useState(defaultKind);
  const [f, setF] = useState({ ward: "", locationText: "", description: "", encroacherName: "", encroacherPhone: "", encroacherAddress: "" });
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [photo, setPhoto] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!gps) { setError("Capture the GPS location of the encroachment."); return; }
    setBusy(true);
    setError(null);
    try {
      await call("POST", "/encroachment/cases", { kind, ...f, ward: f.ward || null, encroacherAddress: f.encroacherAddress || null, latitude: gps.lat, longitude: gps.lng, photoMediaId: photo });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Register encroachment">
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={labelClass}>Type</label>
          <select value={kind} onChange={(e) => setKind(e.target.value as "temporary" | "permanent")} className={inputClass}>
            <option value="temporary">Temporary (24-hour notice)</option>
            <option value="permanent">Permanent (case with notice, Amin report, final order)</option>
          </select>
        </div>
        <div><label className={labelClass}>Encroacher name</label><input required value={f.encroacherName} onChange={set("encroacherName")} className={inputClass} /></div>
        <div><label className={labelClass}>Phone</label><input required inputMode="tel" value={f.encroacherPhone} onChange={set("encroacherPhone")} className={inputClass} /></div>
        <div className="sm:col-span-2"><label className={labelClass}>Encroacher address (optional)</label><input value={f.encroacherAddress} onChange={set("encroacherAddress")} className={inputClass} /></div>
        <div><label className={labelClass}>Ward (optional)</label><input value={f.ward} onChange={set("ward")} className={inputClass} /></div>
        <div><label className={labelClass}>Location / landmark</label><input required value={f.locationText} onChange={set("locationText")} className={inputClass} /></div>
        <div className="sm:col-span-2"><label className={labelClass}>What is encroached</label><textarea required rows={2} value={f.description} onChange={set("description")} className={inputClass} /></div>
        <div className="sm:col-span-2"><GpsField lat={gps?.lat ?? null} lng={gps?.lng ?? null} onChange={(lat, lng) => setGps({ lat, lng })} /></div>
        <div className="sm:col-span-2"><MediaUpload label="Photo of the encroachment" module="encroachment" purpose="encroachment_photo" accept="image/*" lat={gps?.lat} lng={gps?.lng} onUploaded={(m) => setPhoto(m ? m.id : null)} /></div>
        <div className="sm:col-span-2"><button disabled={busy} className={primaryBtn}>{busy ? "Saving..." : "Register case"}</button><ErrorLine message={error} /></div>
      </form>
    </Card>
  );
}
