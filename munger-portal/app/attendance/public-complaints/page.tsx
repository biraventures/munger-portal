"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Droplet, Lightbulb, MapPin, Phone, XCircle } from "lucide-react";
import { AttendanceHeader } from "@/components/attendance/attendance-header";
import { useAttendanceGuard } from "@/lib/use-attendance-guard";
import { fetchAttendanceWards, type AttendanceWard } from "@/lib/attendance-api";
import {
  approveComplaint,
  fetchComplaints,
  rejectComplaint,
  type PendingCounts,
  type PublicComplaint,
  type VerificationStatus,
} from "@/lib/public-reports-api";

const VIEW_ROLES = ["city_manager", "municipal_commissioner", "deputy_municipal_commissioner", "attendance_admin"] as const;
const inputClass = "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-nnm-blue";

const KIND_LABEL = { streetlight: "Streetlight", high_mast: "High Mast", submersible: "Submersible" } as const;
const SWITCH_LABEL: Record<string, string> = { working: "OK", not_working: "Not OK / damaged", automatic: "Automatic", joint: "Joint", unknown: "Don't know" };
const PROBLEM_LABEL: Record<string, string> = {
  no_water: "No water",
  motor_not_running: "Motor not running",
  starter_switch: "Starter / switch / panel fault",
  pipe_leak: "Pipe leaking / burst",
  tap_broken: "Tap broken",
  tank_overflow: "Tank overflowing / damaged",
  other: "Other",
};
const STATUS_TABS: { value: VerificationStatus | ""; label: string }[] = [
  { value: "pending", label: "Awaiting verification" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Not accepted" },
  { value: "", label: "All" },
];

const fmtDate = (v: string | null) => (v ? new Date(v).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" }) : "-");
const fmtDateTime = (v: string | null) =>
  v ? new Date(v).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "-";
const wardLabel = (name: string) => (/^\s*ward/i.test(name) ? name : `Ward ${name}`);

function Complaint({ c, canVerify, onDone }: { c: PublicComplaint; canVerify: boolean; onDone: (msg: string) => void }) {
  const [mode, setMode] = useState<"approve" | "reject" | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const name = `${KIND_LABEL[c.kind]} ${c.serial_number ?? ""}`.trim();

  async function act() {
    setErr(null);
    if (mode === "reject" && text.trim().length < 3) return setErr("Give the reason - the citizen will see it.");
    setBusy(true);
    try {
      if (mode === "approve") {
        const r = await approveComplaint(c.id, text.trim() || null);
        onDone(r.linkedToExisting ? `${name}: approved - it already had an open fault, so the complaint is linked to that one.` : `${name}: approved and sent to the contractor for repair.`);
      } else {
        await rejectComplaint(c.id, text.trim());
        onDone(`${name}: marked as not accepted.`);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  const where =
    c.kind === "streetlight" && c.start_point ? `${c.start_point}${c.end_point ? ` → ${c.end_point}` : ""}` : c.location || "Location not recorded";
  const Icon = c.kind === "submersible" ? Droplet : Lightbulb;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
      <div className="flex flex-wrap items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-nnm-blue">
          <Icon className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900">
            {name} <span className="font-normal text-slate-500">· {wardLabel(c.ward_name)}</span>
          </p>
          <p className="text-xs text-slate-500">
            {where}
            {c.latitude != null && c.longitude != null && (
              <a
                href={`https://www.google.com/maps?q=${c.latitude},${c.longitude}`}
                target="_blank"
                rel="noreferrer"
                className="ml-2 inline-flex items-center gap-0.5 font-semibold text-nnm-blue hover:underline"
              >
                <MapPin className="h-3 w-3" /> Map
              </a>
            )}
          </p>
        </div>
        <span className="text-xs text-slate-400">Received {fmtDateTime(c.reported_at)}</span>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 rounded-lg bg-slate-50 p-3 text-xs sm:grid-cols-2">
        <div>
          <span className="text-slate-500">Not working since:</span> <b>{fmtDate(c.non_functional_since)}</b>
        </div>
        {c.asset_type === "light" ? (
          <div>
            <span className="text-slate-500">Switch status seen:</span> <b>{SWITCH_LABEL[c.switch_status ?? ""] ?? "-"}</b>
          </div>
        ) : (
          <div>
            <span className="text-slate-500">Problem:</span> <b>{PROBLEM_LABEL[c.problem ?? ""] ?? "-"}</b>
          </div>
        )}
        <div className="sm:col-span-2">
          <span className="text-slate-500">Remarks:</span> {c.remarks || <span className="text-slate-400">none</span>}
        </div>
        <div>
          <span className="text-slate-500">Holding:</span> <b>{c.reporter_holding_no}</b>
          {c.holding_owner ? ` (${c.holding_owner})` : ""}
        </div>
        <div>
          <span className="text-slate-500">Mobile:</span>{" "}
          <a href={`tel:${c.reporter_phone}`} className="inline-flex items-center gap-0.5 font-semibold text-nnm-blue hover:underline">
            <Phone className="h-3 w-3" /> {c.reporter_phone}
          </a>
          {c.phone_rejected_count > 0 && <span className="ml-1.5 text-amber-700">({c.phone_rejected_count} earlier complaint(s) not accepted)</span>}
        </div>
      </div>

      {c.status === "pending" && c.already_open && (
        <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
          Staff have already reported this as not working. Approving will link this complaint to that open fault instead of creating another.
        </p>
      )}

      {c.status !== "pending" ? (
        <p className={`mt-3 text-xs ${c.status === "approved" ? "text-green-700" : "text-red-700"}`}>
          {c.status === "approved" ? <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" /> : <XCircle className="mr-1 inline h-3.5 w-3.5" />}
          <b>{c.status === "approved" ? "Approved" : "Not accepted"}</b> by {c.verified_by_name ?? "-"} on {fmtDateTime(c.verified_at)}
          {c.verification_remarks ? ` - ${c.verification_remarks}` : ""}
        </p>
      ) : canVerify ? (
        mode ? (
          <div className="mt-3 space-y-2">
            <label className="block text-xs font-medium text-slate-600">
              {mode === "approve" ? "Remarks for the contractor (optional)" : "Reason for not accepting (the citizen will see this)"}
            </label>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={500} className={inputClass} />
            {err && <p className="text-xs font-medium text-red-700">{err}</p>}
            <div className="flex gap-2">
              <button
                onClick={act}
                disabled={busy}
                className={`rounded-md px-4 py-2 text-xs font-semibold text-white disabled:opacity-60 ${mode === "approve" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}`}
              >
                {busy ? "Saving…" : mode === "approve" ? "Confirm - send for repair" : "Confirm - not accepted"}
              </button>
              <button
                onClick={() => {
                  setMode(null);
                  setErr(null);
                }}
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={() => setMode("approve")} className="rounded-md bg-green-600 px-4 py-2 text-xs font-semibold text-white hover:bg-green-700">
              Verified - approve for repair
            </button>
            <button onClick={() => setMode("reject")} className="rounded-md border border-red-300 bg-white px-4 py-2 text-xs font-semibold text-red-700 hover:bg-red-50">
              Not accepted
            </button>
          </div>
        )
      ) : (
        <p className="mt-3 text-xs text-slate-500">Waiting for the City Manager&apos;s verification.</p>
      )}
    </div>
  );
}

export default function PublicComplaintsPage() {
  const user = useAttendanceGuard([...VIEW_ROLES]);
  const [status, setStatus] = useState<VerificationStatus | "">("pending");
  const [type, setType] = useState<"" | "streetlight" | "high_mast" | "pyau">("");
  const [wardId, setWardId] = useState("");
  const [wards, setWards] = useState<AttendanceWard[]>([]);
  const [rows, setRows] = useState<PublicComplaint[] | null>(null);
  const [pending, setPending] = useState<PendingCounts | null>(null);
  const [canVerify, setCanVerify] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function load() {
    setRows(null);
    setError(null);
    fetchComplaints({ status, type, wardId })
      .then((r) => {
        setRows(r.reports);
        setPending(r.pending);
        setCanVerify(r.canVerify);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load the complaints."));
  }

  useEffect(() => {
    if (!user) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, status, type, wardId]);

  useEffect(() => {
    if (user) fetchAttendanceWards().then(setWards).catch(() => undefined);
  }, [user]);

  if (!user) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;

  return (
    <div className="min-h-screen bg-slate-50">
      <AttendanceHeader user={user} />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <h1 className="mb-1 text-2xl font-semibold text-slate-900">Public Complaints - Verification</h1>
        <p className="mb-5 text-sm text-slate-500">
          Complaints from the public website about non-working streetlights, High Mast lights and submersibles. The <b>City Manager</b> verifies each one (call
          the citizen or check at the site). Only an approved complaint goes to the ward&apos;s contractor for repair - the 72-hour deadline for streetlights
          starts at approval. The citizen sees the result, and the reason if not accepted.
        </p>

        {pending && (
          <div className="mb-5 grid grid-cols-3 gap-3 text-center">
            {[
              { n: pending.streetlight, l: "Streetlights", t: "streetlight" as const },
              { n: pending.high_mast, l: "High Mast", t: "high_mast" as const },
              { n: pending.submersible, l: "Submersibles", t: "pyau" as const },
            ].map((x) => (
              <button
                key={x.l}
                onClick={() => {
                  setStatus("pending");
                  setType(x.t);
                }}
                className="rounded-xl border border-slate-200 bg-white p-3 hover:shadow-sm"
              >
                <div className={`text-2xl font-semibold ${x.n ? "text-red-600" : "text-slate-900"}`}>{x.n}</div>
                <div className="text-xs text-slate-500">{x.l} awaiting verification</div>
              </button>
            ))}
          </div>
        )}

        {!canVerify && rows && (
          <p className="mb-4 rounded-md border border-slate-200 bg-white p-3 text-xs text-slate-600">View only - complaints are verified by the City Manager.</p>
        )}
        {error && (
          <div role="alert" className="mb-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}
        {notice && <div className="mb-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm font-medium text-green-800">{notice}</div>}

        <div className="mb-4 flex flex-wrap items-center gap-2">
          {STATUS_TABS.map((t) => (
            <button
              key={t.label}
              onClick={() => setStatus(t.value)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${status === t.value ? "bg-nnm-blue text-white" : "border border-slate-300 bg-white text-slate-700"}`}
            >
              {t.label}
            </button>
          ))}
          <select value={type} onChange={(e) => setType(e.target.value as typeof type)} className="ml-auto rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm">
            <option value="">All kinds</option>
            <option value="streetlight">Streetlights</option>
            <option value="high_mast">High Mast</option>
            <option value="pyau">Submersibles</option>
          </select>
          <select value={wardId} onChange={(e) => setWardId(e.target.value)} className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm">
            <option value="">All wards</option>
            {wards.map((w) => (
              <option key={w.id} value={String(w.id)}>
                {wardLabel(w.wardName)}
              </option>
            ))}
          </select>
        </div>

        {!rows ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">{status === "pending" ? "No complaints are waiting for verification." : "Nothing here."}</p>
        ) : (
          <div className="space-y-3">
            {rows.map((c) => (
              <Complaint
                key={c.id}
                c={c}
                canVerify={canVerify}
                onDone={(m) => {
                  setNotice(m);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                  load();
                }}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
