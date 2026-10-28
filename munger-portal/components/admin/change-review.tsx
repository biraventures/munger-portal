"use client";

import { useState } from "react";
import { ArrowRight, Info } from "lucide-react";

/**
 * Full-record review for change requests: every field of the holding / shop is shown to every desk in the chain, with
 * the fields the request changes highlighted (old value struck through -> new value), floors added / removed /
 * changed, and the effect on annual tax. "Only changed" narrows the view.
 */

export type Val = string | number | boolean | null | undefined;

export interface ReviewRow {
  label: string;
  before: Val;
  after: Val;
  /** Shown instead of the raw value (e.g. "Yes"/"No", units). */
  format?: (v: Val) => string;
}

export interface ReviewSection {
  title: string;
  rows: ReviewRow[];
}

function norm(v: Val): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "true" : "false";
  const s = String(v).trim();
  if (s !== "" && /^-?\d+(\.\d+)?$/.test(s)) return String(Number(s));
  return s.toLowerCase();
}

export function changed(a: Val, b: Val): boolean {
  return norm(a) !== norm(b);
}

export function show(v: Val, format?: (v: Val) => string): string {
  if (format) return format(v);
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  const s = String(v);
  if (/^-?\d+\.\d+$/.test(s)) return Number(s).toLocaleString("en-IN", { maximumFractionDigits: 2 });
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return new Date(s).toLocaleDateString("en-IN");
  return s;
}

export function ChangeLegend() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
      <span className="inline-flex items-center gap-1">
        <span className="h-3 w-3 rounded-sm border border-amber-300 bg-amber-100" /> Changed
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="h-3 w-3 rounded-sm border border-green-300 bg-green-100" /> Added
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="h-3 w-3 rounded-sm border border-red-300 bg-red-100" /> Removed
      </span>
      <span className="text-slate-400">Old value struck through → new value</span>
    </div>
  );
}

function ValueCell({ row }: { row: ReviewRow }) {
  const isChanged = changed(row.before, row.after);
  if (!isChanged) return <span className="text-slate-800">{show(row.after, row.format)}</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className="text-red-700 line-through decoration-red-400">{show(row.before, row.format)}</span>
      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-label="changes to" />
      <span className="font-semibold text-green-800">{show(row.after, row.format)}</span>
    </span>
  );
}

export function ReviewSections({ sections, onlyChanged }: { sections: ReviewSection[]; onlyChanged: boolean }) {
  return (
    <div className="space-y-4">
      {sections.map((s) => {
        const rows = onlyChanged ? s.rows.filter((r) => changed(r.before, r.after)) : s.rows;
        const n = s.rows.filter((r) => changed(r.before, r.after)).length;
        if (rows.length === 0) return null;
        return (
          <div key={s.title} className="overflow-hidden rounded-lg border border-slate-200">
            <div className="flex items-center justify-between bg-slate-50 px-3 py-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">{s.title}</h3>
              {n > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">{n} changed</span>}
            </div>
            <table className="w-full text-sm">
              <tbody>
                {rows.map((r) => {
                  const c = changed(r.before, r.after);
                  return (
                    <tr key={r.label} className={`border-t border-slate-100 ${c ? "bg-amber-50" : ""}`}>
                      <td className={`w-2/5 px-3 py-2 align-top ${c ? "border-l-4 border-amber-400 font-medium text-amber-900" : "text-slate-500"}`}>{r.label}</td>
                      <td className="px-3 py-2">
                        <ValueCell row={r} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

export function countChanges(sections: ReviewSection[]): number {
  return sections.reduce((t, s) => t + s.rows.filter((r) => changed(r.before, r.after)).length, 0);
}

export function OnlyChangedToggle({ value, onChange, count }: { value: boolean; onChange: (v: boolean) => void; count: number }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm text-slate-700">
        <b className="text-amber-800">{count}</b> {count === 1 ? "entry" : "entries"} changed
      </p>
      <div className="inline-flex rounded-md border border-slate-300 p-0.5 text-xs font-semibold" role="group" aria-label="Rows to show">
        <button type="button" onClick={() => onChange(false)} aria-pressed={!value} className={`rounded px-2.5 py-1 ${!value ? "bg-nnm-blue text-white" : "text-slate-600"}`}>
          All details
        </button>
        <button type="button" onClick={() => onChange(true)} aria-pressed={value} className={`rounded px-2.5 py-1 ${value ? "bg-nnm-blue text-white" : "text-slate-600"}`}>
          Only changed
        </button>
      </div>
    </div>
  );
}

export function BaselineNote({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p className="flex items-start gap-1.5 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {text}
    </p>
  );
}

/** A generic record (shop, agreement ...) - every field, changed ones highlighted. */
export function RecordChangeReview({ title, sections, note }: { title: string; sections: ReviewSection[]; note?: string | null }) {
  const [onlyChanged, setOnlyChanged] = useState(false);
  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        <ChangeLegend />
      </div>
      <OnlyChangedToggle value={onlyChanged} onChange={setOnlyChanged} count={countChanges(sections)} />
      <BaselineNote text={note ?? null} />
      <ReviewSections sections={sections} onlyChanged={onlyChanged} />
    </section>
  );
}
