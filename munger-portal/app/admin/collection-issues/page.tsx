"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, FileWarning, Printer, ScrollText } from "lucide-react";
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

const VIEWER_ROLES = ["tax_daroga", "commissioner", "city_manager"];

type Tab = "pending" | "noticed";

export default function CollectionIssuesPage() {
  const admin = useAdminGuard();
  const [tab, setTab] = useState<Tab>("pending");
  const [pending, setPending] = useState<CollectionIssueWithNotices[] | null>(null);
  const [noticed, setNoticed] = useState<CollectionIssueWithNotices[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openNotice, setOpenNotice] = useState<GeneratedCollectionIssueNotice | null>(null);
  const [languageById, setLanguageById] = useState<Record<number, NoticeLanguage>>({});

  const load = useCallback(async () => {
    try {
      const [p, n] = await Promise.all([fetchAllCollectionIssues("pending"), fetchAllCollectionIssues("noticed")]);
      setPending(p);
      setNoticed(n);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load collection issues.");
    }
  }, []);

  useEffect(() => {
    if (admin) load();
  }, [admin, load]);

  async function handleGenerate(issueId: number) {
    setBusyId(`issue-${issueId}`);
    setError(null);
    try {
      const result = await generateCollectionIssueNotice(issueId, languageById[issueId] ?? "en");
      setOpenNotice(result);
      // Refetch straight away so the issue has already left the pending list by the time the notice is closed.
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
            This is restricted to Tax Daroga, City Manager, and Commissioner.
          </div>
        </main>
      </div>
    );
  }

  const canGenerate = admin.role === "city_manager";

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

  const list = tab === "pending" ? pending : noticed;

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />

      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <FileWarning className="h-6 w-6" />
          Collection Issues
        </h1>
        <p className="mb-5 text-sm text-slate-500">
          Problems Tax Collectors have reported while trying to collect from a taxpayer.
          {canGenerate && " Generate the matching standard legal notice for each one - it moves to Notice issued once you do, where it can be reprinted."}
        </p>

        <div className="mb-5 inline-flex rounded-lg border border-slate-200 bg-white p-1">
          {(["pending", "noticed"] as Tab[]).map((t) => {
            const count = (t === "pending" ? pending : noticed)?.length;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`rounded-md px-4 py-2 text-sm font-semibold transition-colors ${tab === t ? "bg-nnm-blue text-white" : "text-slate-600 hover:text-nnm-blue"}`}
              >
                {t === "pending" ? "Awaiting notice" : "Notice issued"}
                {count !== undefined && <span className="ml-1.5 text-xs opacity-80">({count})</span>}
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
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-400">
            {tab === "pending" ? "No issues awaiting a notice." : "No notice has been issued yet."}
          </div>
        ) : (
          <div className="space-y-3">
            {list.map((i) => (
              <div key={i.id} className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-sm font-semibold text-slate-900">{i.holding_no}</p>
                    <p className="text-sm text-slate-700">{COLLECTION_ISSUE_TYPE_LABELS[i.issue_type]}</p>
                    {i.notes && <p className="mt-1 text-xs text-slate-500">&ldquo;{i.notes}&rdquo;</p>}
                    <p className="mt-1 text-xs text-slate-400">
                      Reported by {i.reported_by_display_name} on {new Date(i.reported_at).toLocaleDateString("en-IN")}
                    </p>
                  </div>
                  {canGenerate && (
                    <div className="flex shrink-0 items-center gap-1.5">
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
                        {busyId === `issue-${i.id}` ? "Generating…" : tab === "pending" ? "Generate Notice" : "Generate Another"}
                      </button>
                    </div>
                  )}
                </div>

                {tab === "noticed" && (
                  <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-100">
                    {i.notices.map((n) => (
                      <li key={n.id} className="flex items-center justify-between gap-3 py-2 text-xs">
                        <span className="text-slate-600">
                          <span className="font-mono font-semibold text-slate-800">{n.notice_no}</span> · {NOTICE_LANGUAGE_LABELS[n.language]} ·{" "}
                          {new Date(n.generated_at).toLocaleDateString("en-IN")} by {n.generated_by_display_name}
                        </span>
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
