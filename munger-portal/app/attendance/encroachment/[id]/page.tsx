"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { AttendanceHeader } from "@/components/attendance/attendance-header";
import { useAttendanceGuard } from "@/lib/use-attendance-guard";
import { call, type EncroachmentDetail } from "@/lib/enforcement-api";
import { Card, ErrorLine, MediaUpload, MediaView, StatusPill, Timeline, fmtDate, fmtDateTime, inputClass, labelClass, outlineBtn, primaryBtn, printDocument } from "@/components/enforcement/parts";
import { FineSection } from "@/components/enforcement/fine";

const ROLES = ["city_manager", "encroachment_staff", "municipal_commissioner", "deputy_municipal_commissioner"] as const;

/** Small helper: runs an action, shows its error under the form, reloads the case when it works. */
function useAction(reload: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try { await fn(); reload(); } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong."); } finally { setBusy(false); }
  }
  return { busy, error, run };
}

export default function EncroachmentCasePage() {
  const user = useAttendanceGuard([...ROLES]);
  const { id } = useParams<{ id: string }>();
  const [d, setD] = useState<EncroachmentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setD(await call<EncroachmentDetail>("GET", `/encroachment/cases/${id}`)); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load the case."); }
  }, [id]);
  useEffect(() => { if (user) load(); }, [user, load]);

  if (!user) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading...</div>;
  const officer = user.role === "city_manager";
  const writer = officer || user.role === "encroachment_staff";

  return (
    <div className="min-h-screen bg-slate-50">
      <AttendanceHeader user={user} />
      <main className="mx-auto max-w-3xl space-y-4 px-4 py-8">
        <Link href="/attendance/encroachment" className="inline-flex items-center gap-1 text-sm text-nnm-blue"><ArrowLeft className="h-4 w-4" /> All cases</Link>
        <ErrorLine message={error} />
        {!d ? <p className="text-sm text-slate-400">Loading...</p> : <Body d={d} officer={officer} writer={writer} reload={load} />}
      </main>
    </div>
  );
}

function Body({ d, officer, writer, reload }: { d: EncroachmentDetail; officer: boolean; writer: boolean; reload: () => void }) {
  const c = d.case;
  const temp = c.kind === "temporary";
  const st = c.status;
  const tempNotice = d.notices.find((n) => n.notice_type === "temporary_24h");
  const permNotice = d.notices.find((n) => n.notice_type === "permanent");
  const deadlinePassed = !!tempNotice?.deadline_at && new Date(tempNotice.deadline_at).getTime() <= Date.now();
  const finalOrder = d.finalOrder;
  const ordered = !!finalOrder && finalOrder.decision !== "no_action";
  const canRemove = temp ? st === "notice_served" || st === "fine_imposed" : ordered && st !== "removed" && st !== "closed";
  const canFine = temp ? st === "notice_served" && deadlinePassed : ordered && (st === "order_passed" || st === "removed");
  const fineBlocked = d.fine ? null : temp
    ? st === "registered" ? "Serve the 24-hour notice first." : st === "notice_served" && !deadlinePassed ? `A fine can be imposed only after the 24 hours are over (${fmtDateTime(tempNotice?.deadline_at)}).` : "A fine is not possible at this stage."
    : "A fine can be imposed only after the final order directs removal.";

  return (
    <>
      <Card>
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="font-mono text-lg font-semibold">{c.case_no}</div>
            <div className="text-xs uppercase tracking-wide text-slate-500">{temp ? "Temporary encroachment" : "Permanent encroachment"}</div>
          </div>
          <StatusPill status={st} />
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div><dt className="text-xs text-slate-500">Encroacher</dt><dd>{c.encroacher_name}</dd></div>
          <div><dt className="text-xs text-slate-500">Phone</dt><dd>{c.encroacher_phone}</dd></div>
          {c.encroacher_address && <div className="col-span-2"><dt className="text-xs text-slate-500">Address</dt><dd>{c.encroacher_address}</dd></div>}
          <div className="col-span-2"><dt className="text-xs text-slate-500">Location</dt><dd>{c.location_text}{c.ward ? `, ${c.ward}` : ""}</dd></div>
          <div className="col-span-2"><dt className="text-xs text-slate-500">Encroachment</dt><dd>{c.description}</dd></div>
          <div className="col-span-2"><dt className="text-xs text-slate-500">GPS</dt>
            <dd><a className="text-nnm-blue underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${c.latitude},${c.longitude}`}>{Number(c.latitude).toFixed(6)}, {Number(c.longitude).toFixed(6)}</a></dd></div>
        </dl>
        <div className="mt-3 flex flex-wrap gap-3">
          <MediaView link={c.photo_link} kind="photo" label="Encroachment photo" />
          <MediaView link={c.removal_link} kind="photo" label="After removal" />
        </div>
        {c.removed_at && <p className="mt-2 text-sm text-green-700">Removed {fmtDateTime(c.removed_at)}{c.removal_remarks ? ` - ${c.removal_remarks}` : ""}</p>}
      </Card>

      {temp ? (
        <TempNotice d={d} writer={writer} reload={reload} deadlinePassed={deadlinePassed} />
      ) : (
        <PermanentChain d={d} officer={officer} writer={writer} reload={reload} permNoticeServed={!!permNotice?.served_at} />
      )}

      {writer && canRemove && <RemoveForm id={c.id} reload={reload} />}
      <FineSection fine={d.fine} base={`/encroachment/cases/${c.id}`} canImpose={canFine} blockedReason={fineBlocked} officer={officer} onChanged={reload} />

      <Card title="History"><Timeline events={d.events} /></Card>
    </>
  );
}

function TempNotice({ d, writer, reload, deadlinePassed }: { d: EncroachmentDetail; writer: boolean; reload: () => void; deadlinePassed: boolean }) {
  const c = d.case;
  const n = d.notices.find((x) => x.notice_type === "temporary_24h");
  const [mode, setMode] = useState<"notice_photo" | "miking_video">("notice_photo");
  const [media, setMedia] = useState<number | null>(null);
  const [text, setText] = useState("");
  const { busy, error, run } = useAction(reload);

  if (n) {
    return (
      <Card title="24-hour notice" tone={deadlinePassed && c.status === "notice_served" ? "warn" : "default"}>
        <p className="text-sm">Served {fmtDateTime(n.served_at ?? n.issued_at)} by {n.issued_by_name}. Remove by <b>{fmtDateTime(n.deadline_at)}</b>.</p>
        {c.status === "notice_served" && <p className="mt-1 text-sm">{deadlinePassed ? "The 24 hours are over and the encroachment is not recorded as removed." : "Within the 24 hours."}</p>}
        {n.notice_text && <p className="mt-2 text-sm text-slate-600">{n.notice_text}</p>}
        <div className="mt-3"><MediaView link={n.proof_link} kind={n.proof_mode === "miking_video" ? "video" : "photo"} label={n.proof_mode === "miking_video" ? "Miking video (proof)" : "Photo of notice (proof)"} /></div>
      </Card>
    );
  }
  if (!writer) return <Card title="24-hour notice"><p className="text-sm text-slate-500">Notice not yet served.</p></Card>;
  return (
    <Card title="Serve 24-hour notice">
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (!media) return; run(() => call("POST", `/encroachment/cases/${c.id}/notice/temporary`, { proofMode: mode, proofMediaId: media, noticeText: text || null })); }}>
        <div>
          <label className={labelClass}>Proof of notice</label>
          <select value={mode} onChange={(e) => { setMode(e.target.value as typeof mode); setMedia(null); }} className={inputClass}>
            <option value="notice_photo">Photo of the notice</option>
            <option value="miking_video">Video of miking in the area</option>
          </select>
        </div>
        <MediaUpload key={mode} required label={mode === "notice_photo" ? "Photo of notice" : "Miking video"} module="encroachment" purpose={mode === "notice_photo" ? "notice_photo" : "miking_video"} accept={mode === "notice_photo" ? "image/*" : "video/*"} onUploaded={(m) => setMedia(m ? m.id : null)} />
        <div><label className={labelClass}>Notice wording (optional)</label><textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} className={inputClass} /></div>
        <button disabled={busy || !media} className={primaryBtn}>Serve notice - starts 24 hours</button>
      </form>
      <ErrorLine message={error} />
    </Card>
  );
}

function RemoveForm({ id, reload }: { id: string; reload: () => void }) {
  const [remarks, setRemarks] = useState("");
  const [photo, setPhoto] = useState<number | null>(null);
  const { busy, error, run } = useAction(reload);
  return (
    <Card title="Mark as removed">
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); run(() => call("POST", `/encroachment/cases/${id}/removed`, { remarks: remarks || null, photoMediaId: photo })); }}>
        <MediaUpload label="Photo after removal (optional)" module="encroachment" purpose="removal_photo" accept="image/*" onUploaded={(m) => setPhoto(m ? m.id : null)} />
        <div><label className={labelClass}>Remarks</label><input value={remarks} onChange={(e) => setRemarks(e.target.value)} className={inputClass} /></div>
        <button disabled={busy} className={primaryBtn}>Mark removed</button>
      </form>
      <ErrorLine message={error} />
    </Card>
  );
}

function PermanentChain({ d, officer, writer, reload, permNoticeServed }: { d: EncroachmentDetail; officer: boolean; writer: boolean; reload: () => void; permNoticeServed: boolean }) {
  const c = d.case;
  const notice = d.notices.find((n) => n.notice_type === "permanent");
  const st = c.status;
  const closedOut = ["order_passed", "removed", "fine_imposed", "closed"].includes(st);
  return (
    <>
      <NoticeCard d={d} officer={officer} writer={writer} reload={reload} permNoticeServed={permNoticeServed} />
      <MeasurementCard d={d} officer={officer} writer={writer} reload={reload} locked={closedOut} />
      {d.finalOrder ? (
        <Card title="Final order" tone={d.finalOrder.decision === "no_action" ? "default" : "warn"}>
          <p className="text-sm"><b>{d.finalOrder.decision === "removal" ? "Removal of encroachment" : d.finalOrder.decision === "no_action" ? "No action" : "Other"}</b> - order dated {fmtDate(d.finalOrder.order_date)}, passed by {d.finalOrder.passed_by_name}</p>
          <p className="mt-2 whitespace-pre-line text-sm text-slate-700">{d.finalOrder.order_text}</p>
          <button className={`${outlineBtn} mt-3`} onClick={() => printDocument("Final Order", [{ heading: "Case no.", text: c.case_no }, { heading: "Encroacher", text: `${c.encroacher_name}, ${c.encroacher_address ?? ""}` }, { heading: "Location", text: c.location_text }, { heading: "Order dated", text: fmtDate(d.finalOrder!.order_date) }, { text: d.finalOrder!.order_text }], `City Manager\n${d.finalOrder!.passed_by_name}`)}><Printer className="h-4 w-4" /> Print order</button>
        </Card>
      ) : officer && st === "ready_for_order" ? (
        <FinalOrderForm id={c.id} reload={reload} />
      ) : (
        <Card title="Final order"><p className="text-sm text-slate-500">{notice ? "The final order can be passed once the notice is served and the Amin's measurement report is received." : "Issue the notice and the measurement order first."}</p></Card>
      )}
    </>
  );
}

function NoticeCard({ d, officer, writer, reload, permNoticeServed }: { d: EncroachmentDetail; officer: boolean; writer: boolean; reload: () => void; permNoticeServed: boolean }) {
  const c = d.case;
  const n = d.notices.find((x) => x.notice_type === "permanent");
  const [text, setText] = useState(
    `Whereas you, ${c.encroacher_name}, have encroached upon public land/property at ${c.location_text}, being: ${c.description}.\n\nYou are hereby directed to remove the said encroachment and show cause, within the time allowed by law, why action should not be taken against you.`,
  );
  const [signed, setSigned] = useState<number | null>(null);
  const { busy, error, run } = useAction(reload);

  if (!n) {
    if (!officer) return <Card title="Notice"><p className="text-sm text-slate-500">The City Manager has not yet issued the notice.</p></Card>;
    return (
      <Card title="Prepare notice to encroacher">
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); run(() => call("POST", `/encroachment/cases/${c.id}/notice/permanent`, { noticeText: text })); }}>
          <textarea required minLength={20} rows={7} value={text} onChange={(e) => setText(e.target.value)} className={inputClass} />
          <button disabled={busy} className={primaryBtn}>Save notice</button>
        </form>
        <ErrorLine message={error} />
      </Card>
    );
  }
  const print = () => printDocument("Notice to Remove Encroachment", [{ heading: "Case no.", text: c.case_no }, { heading: "To", text: `${c.encroacher_name}\n${c.encroacher_address ?? ""}\nPhone: ${c.encroacher_phone}` }, { heading: "Place", text: c.location_text }, { heading: "Date", text: fmtDate(n.issued_at) }, { text: n.notice_text ?? "" }], "City Manager\nNagar Nigam Munger");
  return (
    <Card title="Notice to encroacher" tone={permNoticeServed ? "ok" : "default"}>
      <p className="whitespace-pre-line text-sm text-slate-700">{n.notice_text}</p>
      <p className="mt-2 text-xs text-slate-500">Prepared {fmtDateTime(n.issued_at)} by {n.issued_by_name}</p>
      <button className={`${outlineBtn} mt-3`} onClick={print}><Printer className="h-4 w-4" /> Print for signature</button>
      {permNoticeServed ? (
        <div className="mt-3"><p className="text-sm text-green-700">Served {fmtDateTime(n.served_at)}{n.served_by_name ? ` by ${n.served_by_name}` : ""}.</p><MediaView link={n.proof_link} kind="photo" label="Signed / acknowledged copy" /></div>
      ) : writer ? (
        <form className="mt-4 space-y-3 border-t border-slate-200 pt-4" onSubmit={(e) => { e.preventDefault(); if (signed) run(() => call("POST", `/encroachment/cases/${c.id}/notice/permanent/served`, { signedCopyMediaId: signed })); }}>
          <MediaUpload required label="Photo / scan of the signed notice as served" module="encroachment" purpose="signed_notice" accept="image/*,application/pdf" onUploaded={(m) => setSigned(m ? m.id : null)} />
          <button disabled={busy || !signed} className={primaryBtn}>Mark notice served</button>
          <ErrorLine message={error} />
        </form>
      ) : null}
    </Card>
  );
}

function MeasurementCard({ d, officer, writer, reload, locked }: { d: EncroachmentDetail; officer: boolean; writer: boolean; reload: () => void; locked: boolean }) {
  const c = d.case;
  const [amin, setAmin] = useState("");
  const [orderText, setOrderText] = useState(`The Amin is directed to measure the encroachment at ${c.location_text} (case ${c.case_no}) and submit a report with measurements and a sketch.`);
  const [due, setDue] = useState("");
  const [report, setReport] = useState("");
  const [reportMedia, setReportMedia] = useState<number | null>(null);
  const { busy, error, run } = useAction(reload);

  return (
    <Card title="Office order - Amin's measurement report">
      {d.measurementOrders.map((m) => (
        <div key={m.id} className="mb-3 rounded-md border border-slate-200 p-3 text-sm">
          <div className="font-medium">Amin: {m.amin_name}{m.due_date ? ` - due ${fmtDate(m.due_date)}` : ""}</div>
          <p className="mt-1 whitespace-pre-line text-slate-700">{m.order_text}</p>
          <button className={`${outlineBtn} mt-2`} onClick={() => printDocument("Office Order", [{ heading: "Case no.", text: c.case_no }, { heading: "To", text: `Amin ${m.amin_name}` }, { heading: "Date", text: fmtDate(m.issued_at) }, { text: m.order_text + (m.due_date ? `\n\nReport due by ${fmtDate(m.due_date)}.` : "") }], "City Manager\nNagar Nigam Munger")}><Printer className="h-4 w-4" /> Print order</button>
          {m.report_received_at ? (
            <div className="mt-3 border-t border-slate-200 pt-2">
              <p className="text-green-700">Report received {fmtDateTime(m.report_received_at)}</p>
              <p className="whitespace-pre-line">{m.report_text}</p>
              <MediaView link={m.report_link} kind="photo" label="Report attachment" />
            </div>
          ) : writer && !locked ? (
            <form className="mt-3 space-y-3 border-t border-slate-200 pt-3" onSubmit={(e) => { e.preventDefault(); run(() => call("POST", `/encroachment/cases/${c.id}/measurement-report`, { reportText: report, reportMediaId: reportMedia })); }}>
              <label className={labelClass}>Record Amin&apos;s report</label>
              <textarea required minLength={10} rows={3} value={report} onChange={(e) => setReport(e.target.value)} className={inputClass} placeholder="Measurements, area, findings" />
              <MediaUpload label="Report / sketch (photo or PDF)" module="encroachment" purpose="measurement_report" accept="image/*,application/pdf" onUploaded={(x) => setReportMedia(x ? x.id : null)} />
              <button disabled={busy} className={primaryBtn}>Save report</button>
            </form>
          ) : <p className="mt-2 text-amber-700">Report awaited.</p>}
        </div>
      ))}
      {d.measurementOrders.length === 0 && !officer && <p className="text-sm text-slate-500">No office order issued yet.</p>}
      {officer && d.measurementOrders.length === 0 && !locked && (
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); run(() => call("POST", `/encroachment/cases/${c.id}/measurement-order`, { aminName: amin, orderText, dueDate: due || null })); }}>
          <div><label className={labelClass}>Amin&apos;s name</label><input required value={amin} onChange={(e) => setAmin(e.target.value)} className={inputClass} /></div>
          <div><label className={labelClass}>Order</label><textarea required rows={4} value={orderText} onChange={(e) => setOrderText(e.target.value)} className={inputClass} /></div>
          <div><label className={labelClass}>Report due by (optional)</label><input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={inputClass} /></div>
          <button disabled={busy} className={primaryBtn}>Issue office order</button>
        </form>
      )}
      <ErrorLine message={error} />
    </Card>
  );
}

function FinalOrderForm({ id, reload }: { id: string; reload: () => void }) {
  const [decision, setDecision] = useState("removal");
  const [text, setText] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const { busy, error, run } = useAction(reload);
  return (
    <Card title="Pass final order" tone="warn">
      <p className="mb-3 text-sm text-slate-600">Notice served and Amin&apos;s report received. Pass the order after considering both.</p>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); run(() => call("POST", `/encroachment/cases/${id}/final-order`, { decision, orderText: text, orderDate: date })); }}>
        <div><label className={labelClass}>Decision</label>
          <select value={decision} onChange={(e) => setDecision(e.target.value)} className={inputClass}>
            <option value="removal">Remove the encroachment</option><option value="no_action">No action (closes the case)</option><option value="other">Other direction</option>
          </select></div>
        <div><label className={labelClass}>Order (with reasons)</label><textarea required minLength={20} rows={6} value={text} onChange={(e) => setText(e.target.value)} className={inputClass} /></div>
        <div><label className={labelClass}>Order date</label><input required type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} /></div>
        <button disabled={busy} className={primaryBtn}>Pass order</button>
      </form>
      <ErrorLine message={error} />
    </Card>
  );
}
