"use client";

import { Children, isValidElement, useEffect, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

const STORE_KEY = "nnm_dashboard_open_group";

/**
 * Several dashboard cards clubbed under one card. Clicking it opens the group in place (full width) with its cards;
 * the open group is remembered for the browser tab, so coming back from a page returns to it. A group with no card
 * for this login shows nothing; a group with one card shows just that card.
 */
export function DashboardGroup({
  id,
  title,
  description,
  icon,
  highlight = false,
  children,
}: {
  id: string;
  title: string;
  description: string;
  icon: ReactNode;
  /** Something in the group waits on this login's desk. */
  highlight?: boolean;
  children: ReactNode;
}) {
  const items = Children.toArray(children).filter((c) => isValidElement(c));
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(STORE_KEY) === id) setOpen(true);
    } catch {
      /* storage unavailable - starts closed */
    }
  }, [id]);

  function toggle() {
    const next = !open;
    setOpen(next);
    try {
      if (next) sessionStorage.setItem(STORE_KEY, id);
      else if (sessionStorage.getItem(STORE_KEY) === id) sessionStorage.removeItem(STORE_KEY);
    } catch {
      /* ignore */
    }
  }

  if (items.length === 0) return null;
  if (items.length === 1) return <>{items[0]}</>;

  const tone = highlight ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white";
  const iconTone = highlight ? "bg-amber-100 text-amber-700" : "bg-blue-50 text-nnm-blue";

  if (!open)
    return (
      <button
        type="button"
        onClick={toggle}
        className={`flex flex-col rounded-xl border p-6 text-left transition-shadow hover:shadow-md ${tone}`}
      >
        <span className={`mb-4 flex h-12 w-12 items-center justify-center rounded-full ${iconTone}`}>{icon}</span>
        <h3 className="mb-1.5 flex items-center gap-2 text-base font-semibold text-slate-900">
          {title}
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{items.length}</span>
        </h3>
        <p className="text-sm text-slate-500">{description}</p>
        <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-nnm-blue">
          Open <ChevronDown className="h-3.5 w-3.5" />
        </span>
      </button>
    );

  return (
    <section className={`col-span-full rounded-xl border p-4 ${tone}`}>
      <button type="button" onClick={toggle} className="mb-4 flex w-full items-center justify-between text-left">
        <span className="flex items-center gap-3">
          <span className={`flex h-9 w-9 items-center justify-center rounded-full ${iconTone}`}>{icon}</span>
          <span className="text-base font-semibold text-slate-900">{title}</span>
        </span>
        <span className="inline-flex items-center gap-1 text-xs font-medium text-nnm-blue">
          Close <ChevronUp className="h-3.5 w-3.5" />
        </span>
      </button>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{items}</div>
    </section>
  );
}
