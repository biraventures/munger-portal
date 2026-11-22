"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, FileWarning, Printer, ScrollText } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";
import {
  fetchAllCollectionIssues,
  generateCollectionIssueNotice,
  reprintCollectionIssueNotice,
  COLLECTION_ISSUE_TYPE_LABELS,
  NOTICE_LANGUAGE_LABELS,
  type CollectionIssueWithNotices,
  type GeneratedCollectionIssueNotice,
  type NoticeLanguage,
} from "@/lib/admin-api";
import { CollectionIssueNoticeView } from "@/components/admin/collection-issue-notice-view";
import { CiReceiving, CiStatusBadge } from "@/components/admin/ci-receiving";
import { fetchCollectionIssueCounts, reopenCollectionIssue, resolveCollectionIssue } from "@/lib/collection-issue-api";

const VIEWER_ROLES = ["tax_daroga", "commissioner", "city_manager", "deputy_commissioner"];

type Tab = "open" | "notice_issued" | "resolved" | "receiving_missing" | "removal";
const TABS: { value: Tab; label: string }[] = [
  { value: "open", label: "Open - awaiting notice" },
  { value: "notice_issued", label: "Notice issued" },
  { value: "resolved", label: "Resolved" },
  { value: "receiving_missing", label: "Receiving copy not uploaded" },
  { value: "removal", label: "Removal waiting for DMC" },
];

/**
 * Collection issues reported by Tax Collectors. Open -> Notice issued (City Manager generates the standard legal
 * notice) -> Resolved (automatically when the holding's demand is paid after the report, or by the City Manager /
 * Commissioner with a note; reopenable). Each notice carries its receiving copy - uploaded by the reporting Tax
 * Collector, the Tax Daroga or the City Manager, removed only with the DMC's approval.
 */
export default function CollectionIssuesPage() {
  const admin = useAdminGuard();
  const [tab, setTab] = useState<Tab | null>(null);
  const [list, setList] = useState<CollectionIssueWithNotices[] | null>(null);
  const [counts, setCounts] = useState<{ open: number; notice_issued: number; removals: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openNotice, setOpenNotice] = useState<GeneratedCollectionIssueNotice | null>(null);
  const [languageById, setLanguageById] = useState<Record<number, NoticeLanguage>>({});

  // The DMC starts on the removals waiting for them; everyone else on the open issues.
  const current: Tab = tab ?? (admin?.role === "deputy_commissioner" ? "removal" : "open");

  const load = useCallback(async () => {
    try {
      setList(null);
      const [l, c] = await Promise.all([fetchAllCollectionIssues(current), fetchCollectionIssueCounts()]);
      setList(l);
      setCounts(c);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load collection issues.");
    }
  }, [current]);

  useEffect(() => {
    if (admin && VIEWER_ROLES.includes(admin.role)) load();
  }, [admin, load]);

  async function handleGenerate(issueId: number) {
    setBusyId(`issue-${issueId}`);
    setError(null);
    try {
      const result = await generateCollectionIssueNotice(issueId, languageById[issueId] ?? "en");
      setOpenNotice(result);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate this notice.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleReprint(noticeId: number) {
    setBusyId(`notice-${noticeId}`);
    setError(null);
    try {
      setOpenNotice(await reprintCollectionIssueNotice(noticeId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load this notice.");
    } finally {
      setBusyId(null);
    }
  }

  async function act(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    }
  }

  if (!admin) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  if (!VIEWER_ROLES.includes(admin.role)) {
    return (
      <div className="min-h-screen bg-slate-50">
        <AdminHeader admin={admin} />
        <main className="mx-auto max-w-2xl px-6 py-10">
          <div role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            This is restricted to Tax Daroga, City Manager, DMC and Commissioner.
          </div>
        </main>
      </div>
    );
  }

  // The City Manager or the Tax Daroga issues the notice (signed by whoever generates it).
  const canGenerate = admin.role === "city_manager" || admin.role === "tax_daroga";
  const canResolve = admin.role === "city_manager" || admin.role === "commissioner";

  if (openNotice) {
    return (
      <div className="min-h-screen bg-slate-50">
        <AdminHeader admin={admin} />
        <main className="mx-auto max-w-3xl px-6 py-10">
          <CollectionIssueNoticeView notice={openNotice} onClose={() => setOpenNotice(null)} />
        </main>
      </div>
    );
  }

  const tabCount = (t: Tab) => (t === "open" ? counts?.open : t === "notice_issued" ? counts?.notice_issued : t === "removal" ? counts?.removals : undefined);

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />

      <main className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <FileWarning className="h-6 w-6" />
          Collection Issues
        </h1>
        <p className="mb-5 text-sm text-slate-500">
          Problems Tax Collectors have reported while collecting. The City Manager or the Tax Daroga issues the standard legal notice; the issue is resolved automatically
          when the holding&apos;s demand is paid, or by the City Manager with a note. Each notice&apos;s signed receiving copy is uploaded here - once
          uploaded it is removed only with the DMC&apos;s approval.
        </p>

        <div className="mb-5 flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1">
          {TABS.map((t) => {
            const c = tabCount(t.value);
            const alert = !!c && ((t.value === "open" && canGenerate) || (t.value === "removal" && admin.role === "deputy_commissioner"));
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => setTab(t.value)}
                className={`rounded-md px-3 py-2 text-sm font-semibold transition-colors ${current === t.value ? "bg-nnm-blue text-white" : "text-slate-600 hover:text-nnm-blue"}`}
              >
                {t.label}
                {c !== undefined && (
                  <span className={`ml-1.5 rounded-full px-1.5 text-xs ${alert ? "bg-red-600 text-white" : "opacity-80"}`}>{c}</span>
                )}
              </button>
            );
          })}
        </div>

        {error && (
          <div role="alert" className="mb-5 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {!list ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : list.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-400">Nothing here.</div>
        ) : (
          <div className="space-y-3">
            {list.map((i) => (
              <div key={i.id} className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="flex flex-wrap items-center gap-2 font-mono text-sm font-semibold text-slate-900">
                      {i.holding_no} <CiStatusBadge status={i.status} how={i.resolved_how} />
                    </p>
                    <p className="text-sm text-slate-700">{COLLECTION_ISSUE_TYPE_LABELS[i.issue_type]}</p>
                    {i.notes && <p className="mt-1 text-xs text-slate-500">&ldquo;{i.notes}&rdquo;</p>}
                    <p className="mt-1 text-xs text-slate-400">
                      Reported by {i.reported_by_display_name} on {new Date(i.reported_at).toLocaleDateString("en-IN")}
                    </p>
                    {i.resolution_note && (
                      <p className={`mt-1 text-xs ${i.status === "resolved" ? "text-green-700" : "text-slate-500"}`}>
                        {i.status === "resolved" && (
                          <>
                            <CheckCircle2 className="mr-0.5 inline h-3 w-3" />
                            {i.resolved_by}, {i.resolved_at ? new Date(i.resolved_at).toLocaleDateString("en-IN") : ""}:{" "}
                          </>
                        )}
                        {i.resolution_note}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    {canGenerate && i.status !== "resolved" && (
                      <div className="flex items-center gap-1.5">
                        <select
                          value={languageById[i.id] ?? "en"}
                          onChange={(e) => setLanguageById((m) => ({ ...m, [i.id]: e.target.value as NoticeLanguage }))}
                          className="rounded-md border border-slate-300 px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1"
                        >
                          {Object.entries(NOTICE_LANGUAGE_LABELS).map(([code, label]) => (
                            <option key={code} value={code}>
                              {label}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => handleGenerate(i.id)}
                          disabled={busyId === `issue-${i.id}`}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-nnm-blue px-3 py-1.5 text-xs font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
                        >
                          <ScrollText className="h-3.5 w-3.5" />
                          {busyId === `issue-${i.id}` ? "Generating…" : i.notices.length === 0 ? "Generate Notice" : "Generate Another"}
                        </button>
                      </div>
                    )}
                    {canResolve && i.status !== "resolved" && (
                      <button
                        onClick={() => {
                          const note = window.prompt("How was the issue resolved? (e.g. taxpayer agreed and paid; measurement corrected)");
                          if (note?.trim()) act(() => resolveCollectionIssue(i.id, note.trim()));
                        }}
                        className="rounded-md border border-green-600 px-3 py-1 text-xs font-semibold text-green-700"
                      >
                        Mark resolved
                      </button>
                    )}
                    {canResolve && i.status === "resolved" && (
                      <button
                        onClick={() => window.confirm("Reopen this issue?") && act(() => reopenCollectionIssue(i.id))}
                        className="rounded-md border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-600"
                      >
                        Reopen
                      </button>
                    )}
                  </div>
                </div>

                {i.notices.length > 0 && (
                  <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-100">
                    {i.notices.map((n) => (
                      <li key={n.id} className="flex flex-wrap items-start justify-between gap-3 py-2 text-xs">
                        <div className="text-slate-600">
                          <span className="font-mono font-semibold text-slate-800">{n.notice_no}</span> · {NOTICE_LANGUAGE_LABELS[n.language]} ·{" "}
                          {new Date(n.generated_at).toLocaleDateString("en-IN")} by {n.generated_by_display_name}
                          <CiReceiving notice={n} reportedBy={i.reported_by_username} role={admin.role} username={admin.username} onChanged={load} />
                        </div>
                        <button
                          onClick={() => handleReprint(n.id)}
                          disabled={busyId === `notice-${n.id}`}
                          className="inline-flex shrink-0 items-center gap-1 font-semibold text-nnm-blue hover:underline disabled:opacity-60"
                        >
                          <Printer className="h-3.5 w-3.5" />
                          {busyId === `notice-${n.id}` ? "Opening…" : "View / Reprint"}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
