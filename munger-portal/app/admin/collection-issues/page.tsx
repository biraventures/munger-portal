"use client";

import { useEffect, useState } from "react";
import { AlertCircle, FileWarning, ScrollText } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";
import {
  fetchAllCollectionIssues,
  fetchCollectionIssueNotices,
  generateCollectionIssueNotice,
  COLLECTION_ISSUE_TYPE_LABELS,
  NOTICE_LANGUAGE_LABELS,
  type CollectionIssue,
  type CollectionIssueNotice,
  type GeneratedCollectionIssueNotice,
  type NoticeLanguage,
} from "@/lib/admin-api";
import { CollectionIssueNoticeView } from "@/components/admin/collection-issue-notice-view";

const VIEWER_ROLES = ["tax_daroga", "commissioner", "city_manager"];

export default function CollectionIssuesPage() {
  const admin = useAdminGuard();
  const [issues, setIssues] = useState<CollectionIssue[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [priorNoticesById, setPriorNoticesById] = useState<Record<number, CollectionIssueNotice[]>>({});
  const [generatingId, setGeneratingId] = useState<number | null>(null);
  const [openNotice, setOpenNotice] = useState<GeneratedCollectionIssueNotice | null>(null);
  const [languageById, setLanguageById] = useState<Record<number, NoticeLanguage>>({});

  useEffect(() => {
    if (!admin) return;
    fetchAllCollectionIssues()
      .then(async (list) => {
        setIssues(list);
        const entries = await Promise.all(list.map(async (i) => [i.id, await fetchCollectionIssueNotices(i.id)] as const));
        setPriorNoticesById(Object.fromEntries(entries));
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load collection issues."));
  }, [admin]);

  async function handleGenerate(issueId: number) {
    setGeneratingId(issueId);
    setError(null);
    try {
      const result = await generateCollectionIssueNotice(issueId, languageById[issueId] ?? "en");
      setOpenNotice(result);
      const updated = await fetchCollectionIssueNotices(issueId);
      setPriorNoticesById((m) => ({ ...m, [issueId]: updated }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate this notice.");
    } finally {
      setGeneratingId(null);
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

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />

      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <FileWarning className="h-6 w-6" />
          Collection Issues
        </h1>
        <p className="mb-6 text-sm text-slate-500">
          Problems Tax Collectors have reported while trying to collect from a taxpayer.
          {canGenerate && " Generate the matching standard legal notice for any of these."}
        </p>

        {error && (
          <div role="alert" className="mb-5 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {!issues ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : issues.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-400">No issues reported yet.</div>
        ) : (
          <div className="space-y-3">
            {issues.map((i) => {
              const prior = priorNoticesById[i.id] ?? [];
              return (
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
                          disabled={generatingId === i.id}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-nnm-blue px-3 py-1.5 text-xs font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
                        >
                          <ScrollText className="h-3.5 w-3.5" />
                          {generatingId === i.id ? "Generating…" : "Generate Notice"}
                        </button>
                      </div>
                    )}
                  </div>
                  {prior.length > 0 && (
                    <p className="mt-2 text-xs text-slate-400">
                      {prior.length} notice{prior.length === 1 ? "" : "s"} already generated - most recent: {prior[0]!.notice_no} (
                      {NOTICE_LANGUAGE_LABELS[prior[0]!.language]})
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
