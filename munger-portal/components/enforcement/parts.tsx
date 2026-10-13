"use client";

import { useRef, useState, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, Loader2, Paperclip } from "lucide-react";
import { GpsButton } from "@/components/admin/field-capture";
import { mediaUrl, uploadMedia, type Module, type Purpose, type UploadedMedia } from "@/lib/enforcement-api";

export const inputClass =
  "w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1";
export const labelClass = "mb-1.5 block text-sm font-medium text-slate-700";
export const primaryBtn = "inline-flex items-center justify-center gap-2 rounded-md bg-nnm-blue px-5 py-2.5 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60";
export const outlineBtn = "inline-flex items-center justify-center gap-2 rounded-md border border-nnm-blue px-5 py-2.5 text-sm font-semibold text-nnm-blue hover:bg-blue-50 disabled:opacity-60";

export function Card({ title, children, tone = "default" }: { title?: string; children: ReactNode; tone?: "default" | "warn" | "ok" }) {
  const tones = { default: "border-slate-200 bg-white", warn: "border-amber-300 bg-amber-50", ok: "border-green-300 bg-green-50" };
  return (
    <section className={`rounded-xl border p-5 ${tones[tone]}`}>
      {title && <h3 className="mb-3 text-sm font-semibold text-slate-800">{title}</h3>}
      {children}
    </section>
  );
}

export function ErrorLine({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="mt-3 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      {message}
    </div>
  );
}

export function fmtDateTime(v: string | null | undefined): string {
  if (!v) return "-";
  return new Date(v).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
}
export function fmtDate(v: string | null | undefined): string {
  if (!v) return "-";
  return new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}
export const money = (v: string | number) => `Rs ${Number(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const STATUS_LABELS: Record<string, string> = {
  registered: "Registered", notice_issued: "Notice issued", notice_served: "Notice served", removed: "Removed", fine_imposed: "Fine imposed",
  measurement_pending: "Amin's report awaited", ready_for_order: "Ready for final order", order_passed: "Final order passed", closed: "Closed",
  recorded: "Recorded", noticed: "Notice issued", complied: "Complied", violated_again: "Violated again", fined: "Fined",
};
export function StatusPill({ status }: { status: string }) {
  const color =
    ["removed", "closed", "complied"].includes(status) ? "bg-green-100 text-green-800"
    : ["fine_imposed", "fined", "violated_again", "order_passed"].includes(status) ? "bg-red-100 text-red-800"
    : "bg-amber-100 text-amber-800";
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${color}`}>{STATUS_LABELS[status] ?? status}</span>;
}

export function Timeline({ events }: { events: { action: string; detail: string | null; actor_name: string; at: string }[] }) {
  return (
    <ol className="space-y-2 border-l-2 border-slate-200 pl-4">
      {events.map((e, i) => (
        <li key={i} className="text-sm">
          <span className="font-medium text-slate-800">{e.action.replace(/_/g, " ")}</span>
          {e.detail ? <span className="text-slate-600"> - {e.detail}</span> : null}
          <div className="text-xs text-slate-400">{e.actor_name} - {fmtDateTime(e.at)}</div>
        </li>
      ))}
    </ol>
  );
}

/** Photo or video attached to a case, loaded through a short-lived signed link. */
export function MediaView({ link, kind, label }: { link: string | null; kind: "photo" | "video" | "any"; label: string }) {
  const url = mediaUrl(link);
  if (!url) return null;
  const isVideo = kind === "video" || (kind === "any" && /miking|video/i.test(label));
  return (
    <figure className="inline-block max-w-full">
      {isVideo ? (
        <video src={url} controls preload="metadata" className="max-h-64 max-w-full rounded-md border border-slate-200" />
      ) : (
        <a href={url} target="_blank" rel="noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element -- signed API link, not a static asset */}
          <img src={url} alt={label} className="max-h-48 rounded-md border border-slate-200 object-cover" />
        </a>
      )}
      <figcaption className="mt-1 text-xs text-slate-500">{label}</figcaption>
    </figure>
  );
}

/** Picks a file (camera on phones), uploads it straight away with a progress bar and hands back its id. */
export function MediaUpload({
  label, module, purpose, accept, onUploaded, lat, lng, required,
}: {
  label: string; module: Module; purpose: Purpose; accept: string; onUploaded: (m: UploadedMedia | null) => void;
  lat?: number | null; lng?: number | null; required?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"idle" | "uploading" | "done">("idle");
  const [percent, setPercent] = useState(0);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    setName(file.name);
    setState("uploading");
    setPercent(0);
    onUploaded(null);
    try {
      const m = await uploadMedia(module, purpose, file, { lat, lng, onProgress: setPercent });
      setState("done");
      onUploaded(m);
    } catch (err) {
      setState("idle");
      setError(err instanceof Error ? err.message : "Upload failed.");
    }
  }

  return (
    <div className={`rounded-lg border-2 border-dashed p-3 ${state === "done" ? "border-green-300 bg-green-50" : "border-nnm-blue/40 bg-blue-50/50"}`}>
      <div className="mb-2 text-sm font-semibold text-slate-800">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </div>
      <input ref={ref} type="file" accept={accept} capture={accept.startsWith("video") ? undefined : "environment"} className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
      <button type="button" onClick={() => ref.current?.click()} disabled={state === "uploading"} className={outlineBtn}>
        {state === "uploading" ? <Loader2 className="h-4 w-4 animate-spin" /> : state === "done" ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Paperclip className="h-4 w-4" />}
        {state === "uploading" ? `Uploading ${percent}%` : state === "done" ? "Uploaded - choose another" : accept.startsWith("video") ? "Record / choose video" : "Take / choose photo"}
      </button>
      {state === "uploading" && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-slate-200">
          <div className="h-full bg-nnm-blue transition-all" style={{ width: `${percent}%` }} />
        </div>
      )}
      {name && state !== "idle" && <div className="mt-1 truncate text-xs text-slate-500">{name}</div>}
      <ErrorLine message={error} />
    </div>
  );
}

export function GpsField({ lat, lng, onChange }: { lat: number | null; lng: number | null; onChange: (lat: number, lng: number) => void }) {
  return (
    <div>
      <GpsButton lat={lat} lng={lng} onCapture={onChange} />
      {lat !== null && lng !== null && <div className="mt-1 text-xs text-slate-500">{lat.toFixed(6)}, {lng.toFixed(6)}</div>}
    </div>
  );
}

/** Opens a clean print view of a notice / order / memo in a new window (nothing else from the page is printed). */
export function printDocument(title: string, lines: { heading?: string; text: string }[], footer?: string) {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const body = lines
    .map((l) => `${l.heading ? `<h3>${esc(l.heading)}</h3>` : ""}<p>${esc(l.text).replace(/\n/g, "<br/>")}</p>`)
    .join("");
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
    body{font-family:Georgia,serif;max-width:720px;margin:32px auto;padding:0 24px;color:#111;line-height:1.5}
    h1{text-align:center;font-size:20px;margin:0}h2{text-align:center;font-size:16px;margin:4px 0 24px}
    h3{font-size:13px;text-transform:uppercase;letter-spacing:.04em;margin:18px 0 2px;color:#444}p{margin:0 0 8px;font-size:14px}
    .sign{margin-top:64px;text-align:right;font-size:14px}</style></head><body>
    <h1>Nagar Nigam Munger</h1><h2>${esc(title)}</h2>${body}
    ${footer ? `<div class="sign">${esc(footer)}</div>` : ""}
    <script>window.onload=function(){window.print()}<\/script></body></html>`,
  );
  w.document.close();
}
