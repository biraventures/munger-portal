"use client";

import { useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import {
  COLLECTION_ISSUE_TYPE_LABELS,
  reprintCollectionIssueNotice,
  type CollectionIssueWithNotices,
  type GeneratedCollectionIssueNotice,
} from "@/lib/admin-api";
import { CollectionIssueNoticeView } from "@/components/admin/collection-issue-notice-view";

/** Read-only list of reported collection issues with the legal notices raised on each; any notice can be opened/reprinted. */
export function CollectionIssueList({
  issues,
  showHolding = false,
  emptyText,
}: {
  issues: CollectionIssueWithNotices[] | null;
  showHolding?: boolean;
  emptyText: string;
}) {
  const [openNotice, setOpenNotice] = useState<GeneratedCollectionIssueNotice | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function open(id: number) {
    setBusyId(id);
    setError(null);
    try {
      setOpenNotice(await reprintCollectionIssueNotice(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load this notice.");
    } finally {
      setBusyId(null);
    }
  }

  if (openNotice) return <CollectionIssueNoticeView notice={openNotice} onClose={() => setOpenNotice(null)} />;
  if (!issues) return <p className="text-sm text-slate-400">Loading…</p>;
  if (issues.length === 0) return <p className="text-sm text-slate-400">{emptyText}</p>;

  return (
    <div>
      {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
      <ul className="space-y-2">
        {issues.map((i) => (
          <li key={i.id} className="rounded-md border border-slate-200 p-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-1">
              <span className="font-semibold text-slate-800">
                {showHolding && <span className="mr-1 font-mono">{i.holding_no} ·</span>}
                {COLLECTION_ISSUE_TYPE_LABELS[i.issue_type] ?? i.issue_type}
              </span>
              <span className="text-slate-500">{new Date(i.reported_at).toLocaleString("en-IN")}</span>
            </div>
            {i.notes && <p className="mt-1 text-slate-600">{i.notes}</p>}
            <p className="mt-1 text-slate-500">Reported by {i.reported_by_display_name}</p>
            {i.notices.length === 0 ? (
              <p className="mt-1.5 text-amber-700">No notice issued yet.</p>
            ) : (
              <ul className="mt-1.5 space-y-1">
                {i.notices.map((n) => (
                  <li key={n.id} className="flex items-center justify-between rounded border border-slate-100 bg-slate-50 px-2 py-1">
                    <span>
                      Notice <span className="font-mono font-semibold">{n.notice_no}</span> · {new Date(n.generated_at).toLocaleDateString("en-IN")} · {n.language === "hi" ? "हिन्दी" : "English"}
                    </span>
                    <button
                      onClick={() => open(n.id)}
                      disabled={busyId === n.id}
                      className="inline-flex items-center gap-1 rounded border border-nnm-blue px-2 py-0.5 font-semibold text-nnm-blue hover:bg-blue-50 disabled:opacity-60"
                    >
                      {busyId === n.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />}
                      View
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
