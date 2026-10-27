"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AlertCircle, ArrowLeft, CheckCircle2, ExternalLink, FileText, Loader2, Printer, Trash2, Upload, XCircle } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";
import {
  APPLICANT_DOCS,
  BP_VIEW_ROLES,
  computeFees,
  fetchOfficeDetail,
  OFFICE_DOCS,
  officeAction,
  openOfficeFile,
  removeOfficeDocument,
  rupees,
  uploadOfficeDocument,
  USE_TYPES,
  type BpDocSpec,
  type OfficeDetail,
  type UploadedDoc,
} from "@/lib/building-permit-api";

const inputClass = "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-nnm-blue";
const labelClass = "mb-1 block text-xs font-medium text-slate-600";
const card = "rounded-xl border border-slate-200 bg-white p-5";
const btn = "inline-flex items-center justify-center gap-1.5 rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-60";
const fmt = (s: string | null | undefined) => (s ? new Date(s).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }) : "");
const today = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
const plusYears = (n: number) => {
  const d = new Date(Date.now() + 330 * 60000);
  d.setUTCFullYear(d.getUTCFullYear() + n);
  return d.toISOString().slice(0, 10);
};
const spec = (type: string) => OFFICE_DOCS.find((d) => d.type === type)!;

export default function BuildingPermitDetailPage() {
  const admin = useAdminGuard();
  const { id } = useParams<{ id: string }>();
  const [d, setD] = useState<OfficeDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchOfficeDetail(id)
      .then(setD)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [id]);
  useEffect(() => {
    if (admin && BP_VIEW_ROLES.includes(admin.role)) load();
  }, [admin, load]);

  if (!admin) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  const isClerk = admin.role === "map_section_nodal_clerk";

  async function act(action: string, body: unknown, msg: string) {
    setError(null);
    setNotice(null);
    try {
      await officeAction(id, action, body);
      setNotice(msg);
      load();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const a = d?.application;
  const docsOf = (type: string) => (d?.documents ?? []).filter((x) => x.doc_type === type && x.source === "office");

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />
      <main className="mx-auto max-w-5xl space-y-5 px-4 py-8 sm:px-6">
        <Link href="/admin/building-permits" className="inline-flex items-center gap-1 text-sm font-semibold text-nnm-blue">
          <ArrowLeft className="h-4 w-4" /> All applications
        </Link>
        {error && (
          <p role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" /> {error}
          </p>
        )}
        {notice && (
          <p role="status" className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" /> {notice}
          </p>
        )}
        {!d || !a ? (
          !error && <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        ) : (
          <>
            <section className={card}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h1 className="text-xl font-semibold text-slate-900">{a.application_no}</h1>
                  <p className="text-sm text-slate-600">
                    {String(a.applicant_name)} - {String(a.mobile)} - Ward {String(a.ward)}
                  </p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${a.status === "approved" ? "bg-green-100 text-green-800" : a.status === "rejected" ? "bg-red-100 text-red-700" : a.status === "returned" ? "bg-amber-100 text-amber-800" : "bg-blue-50 text-nnm-blue"}`}>
                  {a.statusLabel}
                </span>
              </div>
              {a.applicant_message && (a.status === "returned" || a.status === "rejected") && (
                <p className="mt-3 whitespace-pre-line rounded-md bg-amber-50 p-3 text-sm text-amber-900">
                  <b>{a.status === "returned" ? "Returned for correction" : "Rejected"}:</b> {a.applicant_message}
                </p>
              )}
              {a.status === "approved" && (
                <Link href={`/admin/building-permits/${id}/permit`} className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-green-700 px-3 py-2 text-xs font-semibold text-white">
                  <Printer className="h-3.5 w-3.5" /> Print permit {String(a.permit_no)}
                </Link>
              )}
            </section>

            {isClerk && <StagePanel d={d} act={act} docsOf={docsOf} reload={load} setError={setError} />}

            <section className={`${card} grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2`}>
              <h2 className="text-sm font-semibold text-slate-800 sm:col-span-2">Application details</h2>
              <Field k="Applicant" v={`${a.applicant_name}${a.relation_name ? `, ${a.relation_name}` : ""}`} />
              <Field k="Mobile / email" v={`${a.mobile}${a.email ? ` / ${a.email}` : ""}`} />
              <Field k="Address" v={a.applicant_address} />
              <Field k="Aadhaar / PAN" v={`${a.aadhaar_no} / ${a.pan_no ?? "-"}`} />
              <Field k="Holding no." v={a.holding_no ?? "-"} />
              <Field k="Ward / Mauza / Thana" v={`${a.ward} / ${a.mauza ?? "-"} / ${a.thana_no ?? "-"}`} />
              <Field k="Khata / Khesra" v={`${a.khata_no} / ${a.khesra_no}`} />
              <Field k="Site" v={a.site_address} />
              <Field k="Plot area" v={`${Number(a.plot_area_sqm).toFixed(2)} sq m`} />
              <Field k="Use" v={a.useTypeLabel} />
              <Field k="Built-up area (applied)" v={`${Number(a.built_up_area_sqm).toFixed(2)} sq m - ${a.floors.map((f) => `${f.floor} ${f.areaSqm}`).join("; ")}`} />
              <Field k="Architect" v={`${a.architect_name} (UDHD ${a.architect_reg_no})${a.architect_mobile ? `, ${a.architect_mobile}` : ""}`} />
              <Field
                k={d.fees.final ? "Fee (final)" : "Fee (as applied)"}
                v={`${rupees(d.fees.total)} = development ${rupees(d.fees.development)} + permit ${rupees(d.fees.permit)} + labour cess ${rupees(d.fees.labourCess)}${d.fees.final ? ` on ${d.fees.builtUpSqm} sq m verified` : ""}`}
              />
              {a.paid_at ? <Field k="Paid" v={`${rupees(Number(a.payment_amount))} - ${a.payment_mode}, ref. ${a.payment_ref} - ${fmt(String(a.paid_at))}`} /> : null}
            </section>

            <section className={card}>
              <h2 className="mb-3 text-sm font-semibold text-slate-800">Applicant&apos;s documents</h2>
              <DocList docs={d.documents.filter((x) => x.source === "applicant")} order={APPLICANT_DOCS} id={id} setError={setError} />
            </section>

            <section className={card}>
              <h2 className="mb-3 text-sm font-semibold text-slate-800">Office reports and orders</h2>
              <DocList docs={d.documents.filter((x) => x.source === "office")} order={OFFICE_DOCS} id={id} setError={setError} />
            </section>

            {d.orders.length > 0 && (
              <section className={card}>
                <h2 className="mb-2 text-sm font-semibold text-slate-800">Online payment attempts</h2>
                <ul className="space-y-1 text-xs text-slate-600">
                  {d.orders.map((o) => (
                    <li key={o.orderId}>
                      {o.orderId} - {rupees(o.amount)} - <b>{o.status}</b> {o.bankTxnId ? `(bank ${o.bankTxnId})` : ""} {o.failureReason ? `- ${o.failureReason}` : ""} - {fmt(o.createdAt)}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className={card}>
              <h2 className="mb-3 text-sm font-semibold text-slate-800">History</h2>
              <ol className="space-y-2 text-sm">
                {d.events.map((e) => (
                  <li key={e.id} className="flex gap-3">
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${e.action === "rejected" ? "bg-red-500" : e.action === "returned" ? "bg-amber-500" : "bg-nnm-blue"}`} />
                    <span>
                      <span className="font-medium text-slate-800">{e.label}</span>
                      {e.finding && <span className={`ml-2 text-xs font-semibold ${e.finding === "satisfactory" ? "text-green-700" : "text-red-700"}`}>{e.finding.replace("_", " ")}</span>}
                      <span className="block text-xs text-slate-500">
                        {fmt(e.at)}
                        {e.by ? ` - ${e.by}` : " - applicant"}
                      </span>
                      {e.remarks && <span className="block whitespace-pre-line text-xs text-slate-600">{e.remarks}</span>}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function Field({ k, v }: { k: string; v: unknown }) {
  return (
    <div>
      <span className="text-xs text-slate-500">{k}</span>
      <p className="text-slate-800">{String(v ?? "-")}</p>
    </div>
  );
}

function DocList({ docs, order, id, setError }: { docs: UploadedDoc[]; order: BpDocSpec[]; id: string; setError: (s: string) => void }) {
  if (docs.length === 0) return <p className="text-sm text-slate-400">None yet.</p>;
  return (
    <ul className="divide-y divide-slate-100 text-sm">
      {order
        .filter((o) => docs.some((x) => x.doc_type === o.type))
        .map((o) => (
          <li key={o.type} className="py-2">
            <span className="text-slate-600">{o.label}</span>
            <span className="mt-1 flex flex-wrap gap-2">
              {docs
                .filter((x) => x.doc_type === o.type)
                .map((x) => (
                  <button
                    key={x.id}
                    onClick={() => openOfficeFile(id, x).catch((e) => setError(e instanceof Error ? e.message : String(e)))}
                    className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-xs text-nnm-blue hover:bg-blue-50"
                  >
                    <FileText className="h-3.5 w-3.5" /> {x.file_name} <ExternalLink className="h-3 w-3" />
                  </button>
                ))}
            </span>
          </li>
        ))}
    </ul>
  );
}

/** Upload one office document type, list what is there, allow removing it before the stage is completed. */
function OfficeUpload({ id, type, docs, reload, setError }: { id: string; type: string; docs: UploadedDoc[]; reload: () => void; setError: (s: string) => void }) {
  const s = spec(type);
  const [pct, setPct] = useState<number | null>(null);
  return (
    <div className="rounded-md border border-dashed border-slate-300 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-700">{s.label}</span>
        <label className="inline-flex cursor-pointer items-center gap-1 rounded border border-nnm-blue px-2 py-1 text-xs font-semibold text-nnm-blue">
          {pct !== null ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} {pct !== null ? `${pct}%` : "Upload"}
          <input
            type="file"
            className="hidden"
            aria-label={`Upload ${s.label}`}
            accept={s.pdfOnly ? "application/pdf" : "application/pdf,image/jpeg,image/png"}
            disabled={pct !== null}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              setPct(0);
              try {
                await uploadOfficeDocument(id, s, f, setPct);
                reload();
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
              } finally {
                setPct(null);
              }
            }}
          />
        </label>
      </div>
      {docs.map((x) => (
        <div key={x.id} className="mt-1 flex items-center justify-between rounded bg-green-50 px-2 py-1 text-xs text-green-800">
          <span className="flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" /> {x.file_name}
          </span>
          <button
            onClick={() =>
              removeOfficeDocument(id, x.id)
                .then(reload)
                .catch((e) => setError(e instanceof Error ? e.message : String(e)))
            }
            aria-label={`Remove ${x.file_name}`}
            className="text-slate-500 hover:text-red-600"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

type Act = (action: string, body: unknown, msg: string) => Promise<void>;

function StagePanel({ d, act, docsOf, reload, setError }: { d: OfficeDetail; act: Act; docsOf: (t: string) => UploadedDoc[]; reload: () => void; setError: (s: string) => void }) {
  const a = d.application;
  const id = a.id;
  const st = a.status;
  const up = (type: string) => <OfficeUpload id={id} type={type} docs={docsOf(type)} reload={reload} setError={setError} />;
  if (!["submitted", "scrutiny", "awaiting_payment", "processing", "authority", "sanctioned"].includes(st)) return null;
  return (
    <section className="space-y-4 rounded-xl border-2 border-nnm-blue bg-white p-5">
      <h2 className="text-base font-semibold text-slate-900">Next step: {a.statusLabel}</h2>
      {st === "submitted" && <SiteStage d={d} act={act} up={up} />}
      {st === "scrutiny" && <ScrutinyStage d={d} act={act} up={up} />}
      {st === "awaiting_payment" && <PaymentStage d={d} act={act} up={up} />}
      {st === "processing" && <ProcessingStage act={act} up={up} />}
      {st === "authority" && <AuthorityStage act={act} up={up} />}
      {st === "sanctioned" && <IssueStage act={act} up={up} />}
      {["submitted", "scrutiny", "processing", "authority"].includes(st) && <ReturnReject act={act} canReturn={st !== "authority"} />}
    </section>
  );
}

const REPORTS = [
  { key: "aa", doc: "aa_site_report", label: "Site verification report - Assistant Architect" },
  { key: "amin", doc: "amin_report", label: "Amin report" },
  { key: "ae", doc: "ae_report", label: "AE report" },
];

function SiteStage({ d, act, up }: { d: OfficeDetail; act: Act; up: (t: string) => React.ReactNode }) {
  const [f, setF] = useState<Record<string, { finding: string; remarks: string }>>({});
  const all = REPORTS.every((r) => d.reports[r.key]);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {REPORTS.map((r) => {
          const done = d.reports[r.key];
          const v = f[r.key] ?? { finding: "satisfactory", remarks: "" };
          return (
            <div key={r.key} className={`space-y-2 rounded-lg border p-3 ${done ? "border-green-300 bg-green-50" : "border-slate-200"}`}>
              <p className="text-sm font-semibold text-slate-800">{r.label}</p>
              {done && (
                <p className="text-xs text-green-800">
                  <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />
                  Recorded: {done.finding.replace("_", " ")} - {done.remarks}
                </p>
              )}
              {up(r.doc)}
              <select aria-label={`${r.label} finding`} value={v.finding} onChange={(e) => setF({ ...f, [r.key]: { ...v, finding: e.target.value } })} className={inputClass}>
                <option value="satisfactory">Satisfactory</option>
                <option value="not_satisfactory">Not satisfactory</option>
              </select>
              <textarea aria-label={`${r.label} remarks`} rows={2} value={v.remarks} onChange={(e) => setF({ ...f, [r.key]: { ...v, remarks: e.target.value } })} placeholder="Findings / remarks" className={inputClass} />
              <button onClick={() => act("site-report", { report: r.key, ...v }, `${r.label} recorded.`)} className={`${btn} w-full border border-nnm-blue text-nnm-blue`}>
                {done ? "Record again" : "Record report"}
              </button>
            </div>
          );
        })}
      </div>
      <button disabled={!all} onClick={() => act("site-complete", {}, "Site verification completed - application moved to technical scrutiny.")} className={`${btn} w-full bg-nnm-blue text-white`}>
        Complete site verification → technical scrutiny
      </button>
      {!all && <p className="text-xs text-slate-500">All three reports must be uploaded and recorded first.</p>}
    </div>
  );
}

function ScrutinyStage({ d, act, up }: { d: OfficeDetail; act: Act; up: (t: string) => React.ReactNode }) {
  const a = d.application;
  const [bua, setBua] = useState(String(Number(a.built_up_area_sqm)));
  const [plot, setPlot] = useState(String(Number(a.plot_area_sqm)));
  const [use, setUse] = useState(a.use_type);
  const [remarks, setRemarks] = useState("");
  const fees = computeFees(use, Number(plot) || 0, Number(bua) || 0);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="sc-bua" className={labelClass}>Verified built-up area (sq m)</label>
          <input id="sc-bua" inputMode="decimal" value={bua} onChange={(e) => setBua(e.target.value.replace(/[^\d.]/g, ""))} className={inputClass} />
        </div>
        <div>
          <label htmlFor="sc-plot" className={labelClass}>Verified plot area (sq m)</label>
          <input id="sc-plot" inputMode="decimal" value={plot} onChange={(e) => setPlot(e.target.value.replace(/[^\d.]/g, ""))} className={inputClass} />
        </div>
        <div>
          <label htmlFor="sc-use" className={labelClass}>Use</label>
          <select id="sc-use" value={use} onChange={(e) => setUse(e.target.value)} className={inputClass}>
            {USE_TYPES.map((u) => (
              <option key={u.value} value={u.value}>{u.label}</option>
            ))}
          </select>
        </div>
      </div>
      <p className="rounded-md bg-slate-50 p-3 text-sm">
        Final fee <b>{rupees(fees.total)}</b> = development {rupees(fees.development)} + permit {rupees(fees.permit)} + labour cess {rupees(fees.labourCess)}
      </p>
      {up("scrutiny_note")}
      <textarea aria-label="Scrutiny remarks" rows={3} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Technical scrutiny remarks (setbacks, FAR, height, parking ... as checked)" className={inputClass} />
      <button
        onClick={() => act("scrutiny", { builtUpSqm: Number(bua), plotAreaSqm: Number(plot), useType: use, remarks }, "Technical scrutiny recorded - the applicant can now pay the fee.")}
        className={`${btn} w-full bg-nnm-blue text-white`}
      >
        Complete technical scrutiny and fix fee
      </button>
    </div>
  );
}

function PaymentStage({ d, act, up }: { d: OfficeDetail; act: Act; up: (t: string) => React.ReactNode }) {
  const [mode, setMode] = useState("Bank Challan");
  const [ref, setRef] = useState("");
  const [paidOn, setPaidOn] = useState(today());
  const amount = d.fees.total;
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        Fee due <b>{rupees(amount)}</b>. The applicant can pay online from the Track Application page; record here only a payment made at the office / bank.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="pay-mode" className={labelClass}>Mode</label>
          <select id="pay-mode" value={mode} onChange={(e) => setMode(e.target.value)} className={inputClass}>
            {["Cash", "Demand Draft", "Bank Challan", "UPI", "Card", "NEFT/RTGS"].map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="pay-ref" className={labelClass}>Receipt / challan / DD no.</label>
          <input id="pay-ref" value={ref} onChange={(e) => setRef(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label htmlFor="pay-date" className={labelClass}>Paid on</label>
          <input id="pay-date" type="date" value={paidOn} max={today()} onChange={(e) => setPaidOn(e.target.value)} className={inputClass} />
        </div>
      </div>
      {up("payment_receipt")}
      <button onClick={() => act("counter-payment", { mode, ref, paidOn, amount }, "Payment recorded - file moved to processing.")} className={`${btn} w-full bg-nnm-blue text-white`}>
        Record payment of {rupees(amount)}
      </button>
    </div>
  );
}

function ProcessingStage({ act, up }: { act: Act; up: (t: string) => React.ReactNode }) {
  const [c, setC] = useState({ physicalSets: false, affidavitOriginal: false, documentsVerified: false });
  const [remarks, setRemarks] = useState("");
  const box = (k: keyof typeof c, label: string) => (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" checked={c[k]} onChange={(e) => setC({ ...c, [k]: e.target.checked })} className="mt-0.5" /> {label}
    </label>
  );
  return (
    <div className="space-y-3">
      {box("physicalSets", "3 printed drawing sets received, countersigned by a UDHD registered architect")}
      {box("affidavitOriginal", "Original joint affidavit with nominee signature received")}
      {box("documentsVerified", "Documents verified with the originals")}
      {up("processing_note")}
      <textarea aria-label="Processing remarks" rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Remarks (optional)" className={inputClass} />
      <button
        disabled={!c.physicalSets || !c.affidavitOriginal || !c.documentsVerified}
        onClick={() => act("processing", { ...c, remarks }, "File verified - sent for competent authority approval.")}
        className={`${btn} w-full bg-nnm-blue text-white`}
      >
        File verified → competent authority
      </button>
    </div>
  );
}

function AuthorityStage({ act, up }: { act: Act; up: (t: string) => React.ReactNode }) {
  const [orderNo, setOrderNo] = useState("");
  const [orderDate, setOrderDate] = useState(today());
  const [remarks, setRemarks] = useState("");
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">Record the competent authority&apos;s approval with the signed order. If the authority refuses, use Reject below with the reason.</p>
      {up("authority_order")}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="au-no" className={labelClass}>Order no.</label>
          <input id="au-no" value={orderNo} onChange={(e) => setOrderNo(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label htmlFor="au-date" className={labelClass}>Order date</label>
          <input id="au-date" type="date" value={orderDate} max={today()} onChange={(e) => setOrderDate(e.target.value)} className={inputClass} />
        </div>
      </div>
      <textarea aria-label="Authority remarks" rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Conditions / remarks (optional)" className={inputClass} />
      <button onClick={() => act("authority", { orderNo, orderDate, remarks }, "Competent authority approval recorded.")} className={`${btn} w-full bg-nnm-blue text-white`}>
        Record competent authority approval
      </button>
    </div>
  );
}

function IssueStage({ act, up }: { act: Act; up: (t: string) => React.ReactNode }) {
  const [validTill, setValidTill] = useState(plusYears(3));
  return (
    <div className="space-y-3">
      {up("approved_drawing")}
      <div className="max-w-xs">
        <label htmlFor="iss-valid" className={labelClass}>Permit valid till</label>
        <input id="iss-valid" type="date" value={validTill} min={today()} onChange={(e) => setValidTill(e.target.value)} className={inputClass} />
      </div>
      <button onClick={() => act("issue", { validTill }, "Building plan approval issued - permit number generated.")} className={`${btn} w-full bg-green-700 text-white`}>
        Issue building plan approval (permit)
      </button>
    </div>
  );
}

function ReturnReject({ act, canReturn }: { act: Act; canReturn: boolean }) {
  const [mode, setMode] = useState<"return" | "reject" | null>(null);
  const [remarks, setRemarks] = useState("");
  return (
    <div className="border-t border-slate-200 pt-3">
      {!mode ? (
        <div className="flex flex-wrap gap-2">
          {canReturn && (
            <button onClick={() => setMode("return")} className={`${btn} border border-amber-500 text-amber-700`}>
              Return to applicant for correction
            </button>
          )}
          <button onClick={() => setMode("reject")} className={`${btn} border border-red-500 text-red-700`}>
            <XCircle className="h-4 w-4" /> Reject
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <textarea
            aria-label={mode === "return" ? "What must be corrected" : "Reason for rejection"}
            rows={3}
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder={mode === "return" ? "What the applicant must correct / upload again - shown to the applicant" : "Reason for rejection - shown to the applicant"}
            className={inputClass}
          />
          <div className="flex gap-2">
            <button
              onClick={() => act(mode, { remarks }, mode === "return" ? "Returned to the applicant." : "Application rejected.")}
              className={`${btn} ${mode === "return" ? "bg-amber-600" : "bg-red-600"} text-white`}
            >
              {mode === "return" ? "Return to applicant" : "Reject application"}
            </button>
            <button onClick={() => setMode(null)} className={`${btn} border border-slate-300 text-slate-700`}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
