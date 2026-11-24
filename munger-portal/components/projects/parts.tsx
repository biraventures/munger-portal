"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { STAGE_COLORS, STAGE_LABELS, blobUrl, type ProjectStage } from "@/lib/project-api";

export const inputClass =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1";
export const labelClass = "mb-1 block text-xs font-medium text-slate-600";
export const primaryBtn =
  "inline-flex items-center justify-center gap-1.5 rounded-md bg-nnm-blue px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50";
export const outlineBtn =
  "inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50";

export function StagePill({ stage }: { stage: ProjectStage }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${STAGE_COLORS[stage]}`}>
      {STAGE_LABELS[stage]}
    </span>
  );
}

export function Card({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="mb-4 inline-flex items-center gap-1 text-sm text-nnm-blue hover:underline">
      <ArrowLeft className="h-4 w-4" /> {label}
    </Link>
  );
}

export function ErrorLine({ error }: { error: string | null }) {
  return error ? <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null;
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center py-10 text-slate-400">
      <Loader2 className="h-5 w-5 animate-spin" />
    </div>
  );
}

/** A photo behind the login. */
export function ProjectImage({ photoId, className }: { photoId: string; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let url: string | null = null;
    let live = true;
    blobUrl(`/photos/${photoId}`)
      .then((u) => {
        url = u;
        if (live) setSrc(u);
      })
      .catch(() => {});
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [photoId]);
  if (!src) return <div className={`animate-pulse bg-slate-100 ${className ?? ""}`} />;
  return (
    <a href={src} target="_blank" rel="noreferrer">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="Site photo" className={`object-cover ${className ?? ""}`} />
    </a>
  );
}

/** Rows of a CSV file, quoted where needed, with a BOM so Excel reads Hindi text. */
export function downloadCsv(fileName: string, rows: (string | number | null)[][]) {
  const esc = (v: string | number | null) => {
    const s = v === null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const blob = new Blob(["\uFEFF" + rows.map((r) => r.map(esc).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
