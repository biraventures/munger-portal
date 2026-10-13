"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { AttendanceHeader } from "@/components/attendance/attendance-header";
import { useAttendanceGuard } from "@/lib/use-attendance-guard";
import { call, type MikingVideo, type MobileCourtDetail } from "@/lib/enforcement-api";
import { Card, ErrorLine, GpsField, MediaUpload, MediaView, StatusPill, Timeline, fmtDate, fmtDateTime, inputClass, labelClass, outlineBtn, primaryBtn, printDocument } from "@/components/enforcement/parts";
import { FineSection } from "@/components/enforcement/fine";

const ROLES = ["apswmo", "mobile_court_staff", "city_manager", "municipal_commissioner", "deputy_municipal_commissioner"] as const;

export default function MobileCourtCasePage() {
  const user = useAttendanceGuard([...ROLES]);
  const { id } = useParams<{ id: string }>();
  const [d, setD] = useState<MobileCourtDetail | null>(null);
  const [videos, setVideos] = useState<MikingVideo[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setD(await call<MobileCourtDetail>("GET", `/mobile-court/cases/${id}`));
      setVideos((await call<{ videos: MikingVideo[] }>("GET", "/mobile-court/miking-videos")).videos);
      setError(null);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load the case."); }
  }, [id]);
  useEffect(() => { if (user) load(); }, [user, load]);

  if (!user) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading...</div>;
  const officer = user.role === "apswmo";
  const writer = officer || user.role === "mobile_court_staff";

  return (
    <div className="min-h-screen bg-slate-50">
      <AttendanceHeader user={user} />
      <main className="mx-auto max-w-3xl space-y-4 px-4 py-8">
        <Link href="/attendance/mobile-court" className="inline-flex items-center gap-1 text-sm text-nnm-blue"><ArrowLeft className="h-4 w-4" /> All cases</Link>
        <ErrorLine message={error} />
        {d && <Body d={d} videos={videos} officer={officer} writer={writer} reload={load} />}
      </main>
    </div>
  );
}

function Body({ d, videos, officer, writer, reload }: { d: MobileCourtDetail; videos: MikingVideo[]; officer: boolean; writer: boolean; reload: () => void }) {
  const c = d.case;
  const st = c.status;
  const lastNotice = d.notices[0];
  const rectifyBy = lastNotice ? new Date(lastNotice.rectify_by) : null;
  const periodOver = !!rectifyBy && rectifyBy.getTime() <= Date.now();
  const canClose = officer && (st === "complied" || (st === "fined" && d.fine?.status === "paid"));

  return (
    <>
      <Card>
        <div className="flex items-start justify-between gap-2">
          <div><div className="font-mono text-lg font-semibold">{c.case_no}</div><div className="text-xs uppercase tracking-wide text-slate-500">{c.violation_type}</div></div>
          <StatusPill status={st} />
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div><dt className="text-xs text-slate-500">Violator</dt><dd>{c.violator_name}</dd></div>
          <div><dt className="text-xs text-slate-500">Phone</dt><dd>{c.violator_phone}</dd></div>
          <div className="col-span-2"><dt className="text-xs text-slate-500">Email</dt><dd>{c.violator_email}</dd></div>
          <div className="col-span-2"><dt className="text-xs text-slate-500">Location</dt><dd>{c.location_text}{c.ward ? `, ${c.ward}` : ""}</dd></div>
          {c.description && <div className="col-span-2"><dt className="text-xs text-slate-500">Details</dt><dd>{c.description}</dd></div>}
          <div className="col-span-2"><dt className="text-xs text-slate-500">GPS</dt>
            <dd><a className="text-nnm-blue underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${c.latitude},${c.longitude}`}>{Number(c.latitude).toFixed(6)}, {Number(c.longitude).toFixed(6)}</a></dd></div>
        </dl>
        <div className="mt-3"><MediaView link={c.evidence_link} kind="photo" label="Evidence" /></div>
      </Card>

      {d.otherCases.length > 0 && (
        <Card title="Other cases against this phone number" tone="warn">
          <ul className="space-y-1 text-sm">
            {d.otherCases.map((o) => <li key={o.id}><Link className="text-nnm-blue underline" href={`/attendance/mobile-court/${o.id}`}>{o.case_no}</Link> - {o.violation_type} ({o.status}, {fmtDate(o.created_at)})</li>)}
          </ul>
        </Card>
      )}

      {d.notices.map((n) => (
        <Card key={n.id} title="Notice to rectify">
          <p className="whitespace-pre-line text-sm">{n.notice_text}</p>
          <p className="mt-2 text-xs text-slate-500">Issued {fmtDateTime(n.issued_at)} by {n.issued_by_name} - rectify within {n.rectify_within_days} days (by {fmtDate(n.rectify_by)})</p>
          {n.miking_link && <div className="mt-2"><MediaView link={n.miking_link} kind="video" label={`Miking video: ${n.miking_title ?? ""}`} /></div>}
          <button className={`${outlineBtn} mt-3`} onClick={() => printDocument("Notice to Rectify Violation", [{ heading: "Case no.", text: c.case_no }, { heading: "To", text: `${c.violator_name}, ${c.violator_phone}` }, { heading: "Violation", text: c.violation_type }, { heading: "Place", text: c.location_text }, { heading: "Date", text: fmtDate(n.issued_at) }, { text: `${n.notice_text}\n\nYou must rectify this within ${n.rectify_within_days} days, by ${fmtDate(n.rectify_by)}. If you violate waste-management norms again, a fine will be imposed.` }], "APSWMO\nNagar Nigam Munger")}><Printer className="h-4 w-4" /> Print notice</button>
        </Card>
      ))}

      {d.followups.length > 0 && (
        <Card title="Follow-ups">
          <ul className="space-y-3 text-sm">
            {d.followups.map((f) => (
              <li key={f.id}>
                <b className={f.outcome === "complied" ? "text-green-700" : "text-red-700"}>{f.outcome === "complied" ? "Complied" : "Violated again"}</b> - {fmtDateTime(f.recorded_at)} by {f.recorded_by_name}
                {f.remarks && <div className="text-slate-600">{f.remarks}</div>}
                <MediaView link={f.evidence_link} kind="photo" label="Follow-up evidence" />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {officer && st === "recorded" && <NoticeForm id={c.id} videos={videos} reload={reload} />}
      {writer && st === "noticed" && <FollowupForm id={c.id} periodOver={periodOver} rectifyBy={rectifyBy} reload={reload} />}

      <FineSection
        fine={d.fine}
        base={`/mobile-court/cases/${c.id}`}
        canImpose={st === "violated_again"}
        blockedReason={st === "recorded" ? "Issue a notice first." : st === "noticed" ? "A fine is possible only if the violator violates again after the notice." : null}
        officer={officer}
        defaultEmail={c.violator_email}
        onChanged={reload}
      />

      {canClose && <CloseButton id={c.id} reload={reload} />}
      <Card title="History"><Timeline events={d.events} /></Card>
    </>
  );
}

function NoticeForm({ id, videos, reload }: { id: string; videos: MikingVideo[]; reload: () => void }) {
  const [text, setText] = useState("You have been found violating solid waste management norms. You are directed to rectify your behaviour and follow the norms.");
  const [days, setDays] = useState("7");
  const [video, setVideo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try { await call("POST", `/mobile-court/cases/${id}/notice`, { noticeText: text, rectifyWithinDays: Number(days), mikingVideoId: video ? Number(video) : null }); reload(); }
    catch (err) { setError(err instanceof Error ? err.message : "Failed."); } finally { setBusy(false); }
  }
  return (
    <Card title="Issue notice to rectify" tone="warn">
      <form onSubmit={submit} className="space-y-3">
        <div><label className={labelClass}>Notice</label><textarea required minLength={10} rows={4} value={text} onChange={(e) => setText(e.target.value)} className={inputClass} /></div>
        <div><label className={labelClass}>Days to rectify (1-90)</label><input required type="number" min={1} max={90} value={days} onChange={(e) => setDays(e.target.value)} className={inputClass} /></div>
        <div><label className={labelClass}>Miking video kept for this purpose (optional)</label>
          <select value={video} onChange={(e) => setVideo(e.target.value)} className={inputClass}>
            <option value="">None</option>{videos.map((v) => <option key={v.id} value={v.id}>{v.title} - {v.area_text} ({fmtDate(v.recorded_on)})</option>)}
          </select></div>
        <button disabled={busy} className={primaryBtn}>Issue notice</button>
      </form>
      <ErrorLine message={error} />
    </Card>
  );
}

function FollowupForm({ id, periodOver, rectifyBy, reload }: { id: string; periodOver: boolean; rectifyBy: Date | null; reload: () => void }) {
  const [outcome, setOutcome] = useState<"complied" | "violated_again">("complied");
  const [remarks, setRemarks] = useState("");
  const [photo, setPhoto] = useState<number | null>(null);
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try { await call("POST", `/mobile-court/cases/${id}/followup`, { outcome, remarks: remarks || null, evidenceMediaId: photo, latitude: gps?.lat, longitude: gps?.lng }); reload(); }
    catch (err) { setError(err instanceof Error ? err.message : "Failed."); } finally { setBusy(false); }
  }
  return (
    <Card title="Record follow-up visit">
      <p className="mb-3 text-sm text-slate-600">Rectify period ends {fmtDate(rectifyBy?.toISOString())}{periodOver ? " (over)" : " - recording a repeat violation is possible only after this date"}.</p>
      <form onSubmit={submit} className="space-y-3">
        <select value={outcome} onChange={(e) => setOutcome(e.target.value as typeof outcome)} className={inputClass}>
          <option value="complied">Complied - behaviour rectified</option><option value="violated_again">Violated again</option>
        </select>
        <input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Remarks" className={inputClass} />
        {outcome === "violated_again" && (
          <>
            <GpsField lat={gps?.lat ?? null} lng={gps?.lng ?? null} onChange={(lat, lng) => setGps({ lat, lng })} />
            <MediaUpload required label="Photo evidence of repeat violation" module="mobile_court" purpose="followup_evidence" accept="image/*" lat={gps?.lat} lng={gps?.lng} onUploaded={(m) => setPhoto(m ? m.id : null)} />
          </>
        )}
        <button disabled={busy} className={primaryBtn}>Save follow-up</button>
      </form>
      <ErrorLine message={error} />
    </Card>
  );
}

function CloseButton({ id, reload }: { id: string; reload: () => void }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <Card>
      <button className={primaryBtn} onClick={async () => { try { await call("POST", `/mobile-court/cases/${id}/close`, {}); reload(); } catch (e) { setError(e instanceof Error ? e.message : "Failed."); } }}>Close case</button>
      <ErrorLine message={error} />
    </Card>
  );
}
