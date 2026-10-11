"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertCircle, CheckCircle2, ExternalLink, Loader2, UserRound, Users } from "lucide-react";
import {
  STATUS_LABELS,
  actOnWhosWhoEntry,
  createWhosWhoEntry,
  fetchWhosWhoEntries,
  fetchWhosWhoFileUrl,
  fetchWhosWhoMe,
  formatIsoDate,
  formatPhone,
  resubmitWhosWhoEntry,
  withdrawWhosWhoEntry,
  wordCount,
  type WhosWhoEntry,
  type WhosWhoInput,
  type WhosWhoLogin,
  type WhosWhoMe,
  type WhosWhoStatus,
} from "@/lib/whos-who-api";

const inputClass = "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-nnm-blue focus:outline-none";
const labelClass = "mb-1 block text-xs font-semibold text-slate-600";
const BACK: Record<WhosWhoLogin, string> = { admin: "/admin/dashboard", operator: "/operator/dashboard", attendance: "/attendance/dashboard" };
const BADGE: Record<WhosWhoStatus, string> = {
  pending_verification: "bg-amber-100 text-amber-800",
  pending_publication: "bg-blue-100 text-blue-800",
  returned: "bg-red-100 text-red-700",
  published: "bg-green-100 text-green-700",
  archived: "bg-slate-100 text-slate-500",
};

type FormMode = { kind: "new" } | { kind: "resubmit"; entry: WhosWhoEntry } | { kind: "update"; entry: WhosWhoEntry };

function emptyInput(): WhosWhoInput {
  return {
    designation: "ward_councillor",
    wardNo: null,
    areaCharge: "",
    nameEn: "",
    nameHi: "",
    dateAssumedOffice: "",
    contactNumber: "",
    contactIsPersonal: false,
    email: "",
    publicMessage: "",
    formNo: "",
    consentConfirmed: false,
    photo: null,
    signedForm: null,
  };
}

function inputFrom(e: WhosWhoEntry): WhosWhoInput {
  return {
    designation: e.designation,
    wardNo: e.ward_no,
    areaCharge: e.area_charge ?? "",
    nameEn: e.name_en,
    nameHi: e.name_hi ?? "",
    dateAssumedOffice: e.date_assumed_office,
    contactNumber: e.contact_number,
    contactIsPersonal: e.contact_is_personal,
    email: e.email ?? "",
    publicMessage: e.public_message ?? "",
    formNo: e.form_no ?? "",
    consentConfirmed: false,
    photo: null,
    signedForm: null,
  };
}

function StaffPhoto({ as, id, version }: { as: WhosWhoLogin; id: string; version: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let u: string | null = null;
    let cancelled = false;
    fetchWhosWhoFileUrl(as, id, "photo")
      .then((x) => {
        u = x;
        if (!cancelled) setUrl(x);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (u) URL.revokeObjectURL(u);
    };
  }, [as, id, version]);
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className="h-28 w-22 shrink-0 rounded-md object-cover" />
  ) : (
    <span className="flex h-28 w-22 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-400">
      <UserRound className="h-8 w-8" strokeWidth={1.4} />
    </span>
  );
}

function EntryForm({
  me,
  mode,
  busy,
  onSubmit,
  onCancel,
}: {
  me: WhosWhoMe;
  mode: FormMode;
  busy: boolean;
  onSubmit: (input: WhosWhoInput) => void;
  onCancel: () => void;
}) {
  const [v, setV] = useState<WhosWhoInput>(() => (mode.kind === "new" ? emptyInput() : inputFrom(mode.entry)));
  const [preview, setPreview] = useState<string | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof WhosWhoInput>(k: K, val: WhosWhoInput[K]) => setV((p) => ({ ...p, [k]: val }));
  const words = wordCount(v.publicMessage);
  const filesRequired = mode.kind !== "resubmit";

  useEffect(() => {
    if (!v.photo) return setPreview(null);
    const u = URL.createObjectURL(v.photo);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [v.photo]);

  const title =
    mode.kind === "new" ? "New entry" : mode.kind === "resubmit" ? `Correct and resubmit: ${mode.entry.name_en}` : `Update published entry: ${mode.entry.name_en}`;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(v);
      }}
      className="space-y-4"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
        {mode.kind !== "new" && (
          <button type="button" onClick={onCancel} className="text-xs text-slate-500 hover:underline">
            Cancel
          </button>
        )}
      </div>
      {mode.kind === "update" && (
        <p className="rounded-md bg-blue-50 p-2 text-xs text-blue-800">
          Enter the fresh signed form. When the DMC publishes this update, the current entry is taken off the website automatically.
        </p>
      )}
      {mode.kind === "resubmit" && mode.entry.return_reason && (
        <p className="rounded-md bg-red-50 p-2 text-xs text-red-700">
          Sent back by {mode.entry.returned_by}: {mode.entry.return_reason}
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass}>1. Designation</label>
          <select value={v.designation} onChange={(e) => set("designation", e.target.value)} className={inputClass}>
            {me.designations.map((d) => (
              <option key={d.key} value={d.key}>
                {d.en} ({d.hi})
              </option>
            ))}
          </select>
        </div>
        {v.designation === "ward_councillor" ? (
          <div>
            <label className={labelClass}>Ward No.</label>
            <select value={v.wardNo ?? ""} onChange={(e) => set("wardNo", e.target.value ? Number(e.target.value) : null)} required className={inputClass}>
              <option value="">Select ward</option>
              {Array.from({ length: me.wardCount }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  Ward {n}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div>
            <label className={labelClass}>Area / charge (optional)</label>
            <input value={v.areaCharge} onChange={(e) => set("areaCharge", e.target.value)} placeholder="e.g. Zone 2, Revenue" className={inputClass} />
          </div>
        )}
        <div>
          <label className={labelClass}>2. Full name (English)</label>
          <input value={v.nameEn} onChange={(e) => set("nameEn", e.target.value)} required className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>3. Full name (Hindi)</label>
          <input value={v.nameHi} onChange={(e) => set("nameHi", e.target.value)} lang="hi" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>5. Date of assuming office in Munger Nagar Nigam</label>
          <input type="date" value={v.dateAssumedOffice} onChange={(e) => set("dateAssumedOffice", e.target.value)} required className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>7. Contact number to be published</label>
          <input value={v.contactNumber} onChange={(e) => set("contactNumber", e.target.value)} inputMode="tel" required placeholder="10-digit mobile" className={inputClass} />
          <div className="mt-1 flex gap-4 text-xs text-slate-600">
            <label className="inline-flex items-center gap-1">
              <input type="radio" checked={!v.contactIsPersonal} onChange={() => set("contactIsPersonal", false)} /> Official
            </label>
            <label className="inline-flex items-center gap-1">
              <input type="radio" checked={v.contactIsPersonal} onChange={() => set("contactIsPersonal", true)} /> Personal
            </label>
          </div>
        </div>
        <div>
          <label className={labelClass}>9. Official email (optional)</label>
          <input type="email" value={v.email} onChange={(e) => set("email", e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Form No. (optional)</label>
          <input value={v.formNo} onChange={(e) => set("formNo", e.target.value)} className={inputClass} />
        </div>
      </div>

      <div>
        <label className={labelClass}>
          10. Public message <span className={words > me.messageMaxWords ? "text-red-600" : "text-slate-400"}>({words}/{me.messageMaxWords} words)</span>
        </label>
        <textarea value={v.publicMessage} onChange={(e) => set("publicMessage", e.target.value)} rows={3} className={inputClass} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Photograph (JPG/PNG){filesRequired ? "" : " - leave empty to keep the current one"}</label>
          <div className="flex items-center gap-3">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="" className="h-20 w-16 rounded object-cover" />
            ) : (
              <span className="flex h-20 w-16 items-center justify-center rounded bg-slate-100 text-slate-400">
                <UserRound className="h-6 w-6" />
              </span>
            )}
            <input ref={photoRef} type="file" accept=".jpg,.jpeg,.png" required={filesRequired} onChange={(e) => set("photo", e.target.files?.[0] ?? null)} className="text-xs" />
          </div>
        </div>
        <div>
          <label className={labelClass}>Scanned signed form with supporting document (PDF/JPG/PNG, up to {Math.round(me.maxSignedFormBytes / 1048576)} MB)</label>
          <input ref={formRef} type="file" accept=".pdf,.jpg,.jpeg,.png" required={filesRequired} onChange={(e) => set("signedForm", e.target.files?.[0] ?? null)} className="text-xs" />
        </div>
      </div>

      <label className="flex items-start gap-2 text-xs text-slate-700">
        <input type="checkbox" checked={v.consentConfirmed} onChange={(e) => set("consentConfirmed", e.target.checked)} className="mt-0.5" />
        The official has signed the declaration and consent (Part A, item 11) on the form.
      </label>

      <button type="submit" disabled={busy || words > me.messageMaxWords} className="rounded-md bg-nnm-blue px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
        {busy ? "Saving…" : "Submit for City Manager verification"}
      </button>
    </form>
  );
}

function EntryCard({
  as,
  me,
  e,
  busy,
  children,
}: {
  as: WhosWhoLogin;
  me: WhosWhoMe;
  e: WhosWhoEntry;
  busy: boolean;
  children?: React.ReactNode;
}) {
  const d = me.designations.find((x) => x.key === e.designation);
  const [err, setErr] = useState<string | null>(null);
  async function openForm() {
    try {
      const url = await fetchWhosWhoFileUrl(as, e.id, "signed-form");
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Could not open.");
    }
  }
  return (
    <li className={`rounded-lg border border-slate-200 bg-white p-4 ${busy ? "opacity-70" : ""}`}>
      <div className="flex gap-4">
        <StaffPhoto as={as} id={e.id} version={e.updated_at} />
        <div className="min-w-0 flex-1 text-xs text-slate-600">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold text-slate-900">
              {e.name_en}
              {e.name_hi && <span className="ml-1 font-normal text-slate-500">· {e.name_hi}</span>}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${BADGE[e.status]}`}>{STATUS_LABELS[e.status]}</span>
          </div>
          <p className="mt-0.5">
            {d?.en ?? e.designation}
            {e.ward_no ? `, Ward ${e.ward_no}` : ""}
            {e.area_charge ? ` (${e.area_charge})` : ""} · since {formatIsoDate(e.date_assumed_office)}
          </p>
          <p>
            {formatPhone(e.contact_number)} ({e.contact_is_personal ? "personal" : "official"}){e.email ? ` · ${e.email}` : ""}
          </p>
          {e.public_message && <p className="mt-1 italic text-slate-700">“{e.public_message}”</p>}
          <p className="mt-1 text-[11px] text-slate-400">
            Entered by {e.entered_by} on {formatIsoDate(e.entered_at)}
            {e.form_no ? ` · Form ${e.form_no}` : ""}
            {e.replaces_id ? " · update to an existing entry" : ""}
            {e.verified_by ? ` · verified by ${e.verified_by}` : ""}
            {e.published_by ? ` · published by ${e.published_by} on ${formatIsoDate(e.published_at!)}` : ""}
            {e.archived_by ? ` · archived by ${e.archived_by}` : ""}
          </p>
          {e.status === "returned" && e.return_reason && <p className="mt-1 text-red-700">Sent back by {e.returned_by}: {e.return_reason}</p>}
          <button onClick={openForm} className="mt-1 inline-flex items-center gap-1 text-nnm-blue hover:underline">
            <ExternalLink className="h-3 w-3" /> Signed form ({e.signed_form_name})
          </button>
          {err && <p className="text-red-600">{err}</p>}
        </div>
      </div>
      {children && <div className="mt-3 border-t border-slate-100 pt-3">{children}</div>}
    </li>
  );
}

function ReviewActions({
  me,
  e,
  busy,
  onAct,
}: {
  me: WhosWhoMe;
  e: WhosWhoEntry;
  busy: boolean;
  onAct: (id: string, action: "verify" | "return" | "publish" | "archive", body?: { checks?: Record<string, boolean>; reason?: string }) => void;
}) {
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [returning, setReturning] = useState(false);
  const [reason, setReason] = useState("");
  const allTicked = me.verificationChecks.every((c) => checks[c.key]);

  const back = returning ? (
    <span className="flex flex-wrap items-center gap-2">
      <input value={reason} onChange={(x) => setReason(x.target.value)} placeholder="Reason for sending back" className="rounded border border-slate-300 px-2 py-1 text-xs" />
      <button disabled={busy || reason.trim().length < 3} onClick={() => onAct(e.id, "return", { reason })} className="rounded bg-red-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-60">
        Confirm send back
      </button>
      <button onClick={() => setReturning(false)} className="text-xs text-slate-500">
        Cancel
      </button>
    </span>
  ) : (
    <button onClick={() => setReturning(true)} className="rounded border border-red-300 px-3 py-1 text-xs font-semibold text-red-700">
      Send back to operator
    </button>
  );

  if (me.role === "verifier") {
    return (
      <div className="space-y-2">
        <p className="text-xs font-semibold text-slate-700">Part C verification - tick each item after checking it against the form</p>
        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {me.verificationChecks.map((c) => (
            <label key={c.key} className="flex items-start gap-2 text-xs text-slate-700">
              <input type="checkbox" checked={!!checks[c.key]} onChange={(x) => setChecks((p) => ({ ...p, [c.key]: x.target.checked }))} className="mt-0.5" />
              {c.label}
            </label>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button disabled={busy || !allTicked} onClick={() => onAct(e.id, "verify", { checks })} className="rounded bg-nnm-blue px-3 py-1 text-xs font-semibold text-white disabled:opacity-60">
            Verified - forward to DMC
          </button>
          {back}
        </div>
      </div>
    );
  }
  if (me.role === "publisher" && e.status === "pending_publication") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button disabled={busy} onClick={() => onAct(e.id, "publish")} className="rounded bg-nnm-blue px-3 py-1 text-xs font-semibold text-white disabled:opacity-60">
          Approve &amp; publish on website
        </button>
        {back}
      </div>
    );
  }
  if (me.role === "publisher" && e.status === "published") {
    return (
      <button
        disabled={busy}
        onClick={() => {
          if (window.confirm(`Take ${e.name_en} off the website? Use this when the official has left the post.`)) onAct(e.id, "archive");
        }}
        className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 disabled:opacity-60"
      >
        Archive (left office)
      </button>
    );
  }
  return null;
}

function Tracker({ me, entries }: { me: WhosWhoMe; entries: WhosWhoEntry[] }) {
  const rows = me.designations.map((d) => {
    const of = entries.filter((e) => e.designation === d.key);
    return {
      d,
      inReview: of.filter((e) => e.status === "pending_verification" || e.status === "pending_publication").length,
      returned: of.filter((e) => e.status === "returned").length,
      published: of.filter((e) => e.status === "published").length,
    };
  });
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="text-slate-500">
          <tr>
            <th className="py-1 pr-3 font-semibold">Position</th>
            <th className="py-1 pr-3 font-semibold">In review</th>
            <th className="py-1 pr-3 font-semibold">Sent back</th>
            <th className="py-1 font-semibold">Published</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.d.key} className="border-t border-slate-100">
              <td className="py-1 pr-3 text-slate-800">{r.d.en}</td>
              <td className="py-1 pr-3">{r.inReview || "-"}</td>
              <td className="py-1 pr-3">{r.returned || "-"}</td>
              <td className="py-1">{r.d.key === "ward_councillor" ? `${r.published} of ${me.wardCount}` : r.published || "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Inner() {
  const params = useSearchParams();
  const as = (["admin", "operator", "attendance"].includes(params.get("as") ?? "") ? params.get("as") : "operator") as WhosWhoLogin;
  const [me, setMe] = useState<WhosWhoMe | null>(null);
  const [entries, setEntries] = useState<WhosWhoEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<FormMode>({ kind: "new" });
  const [formKey, setFormKey] = useState(0);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    try {
      setMe(await fetchWhosWhoMe(as));
      setEntries(await fetchWhosWhoEntries(as));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load.");
    }
  }, [as]);

  useEffect(() => {
    load();
  }, [load]);

  async function run(fn: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      await fn();
      setMsg(success);
      await load();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      return false;
    } finally {
      setBusy(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  async function submit(input: WhosWhoInput) {
    const ok = await run(
      () =>
        mode.kind === "resubmit"
          ? resubmitWhosWhoEntry(as, mode.entry.id, input)
          : createWhosWhoEntry(as, { ...input, replacesId: mode.kind === "update" ? mode.entry.id : null }),
      "Saved. It is now with the City Manager for verification.",
    );
    if (ok) {
      setMode({ kind: "new" });
      setFormKey((k) => k + 1);
    }
  }

  const act = (id: string, action: "verify" | "return" | "publish" | "archive", body?: { checks?: Record<string, boolean>; reason?: string }) =>
    run(() => actOnWhosWhoEntry(as, id, action, body), {
      verify: "Verified and forwarded to the DMC.",
      return: "Sent back to the operator.",
      publish: "Published on the website.",
      archive: "Taken off the website.",
    }[action]);

  const list = useMemo(() => entries ?? [], [entries]);
  const queue =
    me?.role === "verifier" ? list.filter((e) => e.status === "pending_verification")
    : me?.role === "publisher" ? list.filter((e) => e.status === "pending_publication")
    : [];
  const published = list.filter((e) => e.status === "published");
  const openReplacementFor = new Set(list.filter((e) => e.replaces_id && ["pending_verification", "pending_publication", "returned"].includes(e.status)).map((e) => e.replaces_id));
  // An operator's list holds their own entries plus everything published; "Your entries" is the ones still in the workflow.
  const mine = me?.role === "operator" ? list.filter((e) => ["pending_verification", "pending_publication", "returned"].includes(e.status)) : [];

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <h1 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <Users className="h-5 w-5" /> Website Who&apos;s Who
          </h1>
          <div className="flex items-center gap-4 text-sm">
            <a href="/whos-who" target="_blank" rel="noopener noreferrer" className="text-nnm-blue hover:underline">
              View public page
            </a>
            <Link href={BACK[as]} className="text-nnm-blue hover:underline">
              ← Back to dashboard
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl space-y-8 px-6 py-8">
        {error && (
          <div role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" /> {error}
          </div>
        )}
        {msg && (
          <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" /> {msg}
          </div>
        )}
        {!me || !entries ? (
          !error && <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        ) : (
          <>
            <p className="text-xs text-slate-500">
              Operator enters the signed form → City Manager verifies → Deputy Municipal Commissioner publishes. You are signed in as{" "}
              <strong>{me.displayName}</strong> (
              {{ operator: "Operator", verifier: "City Manager - verify", publisher: "DMC - approve & publish", viewer: "view only" }[me.role]}).
            </p>

            {(me.role === "verifier" || me.role === "publisher") && (
              <section className="rounded-xl border border-amber-300 bg-amber-50 p-5">
                <h2 className="mb-3 text-sm font-semibold text-amber-900">Waiting for you ({queue.length})</h2>
                {queue.length === 0 ? (
                  <p className="text-sm text-amber-800">Nothing is waiting.</p>
                ) : (
                  <ul className="space-y-3">
                    {queue.map((e) => (
                      <EntryCard key={e.id} as={as} me={me} e={e} busy={busy}>
                        <ReviewActions me={me} e={e} busy={busy} onAct={act} />
                      </EntryCard>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {me.role === "operator" && (
              <section className="rounded-xl border border-slate-200 bg-white p-5">
                <EntryForm key={formKey} me={me} mode={mode} busy={busy} onSubmit={submit} onCancel={() => { setMode({ kind: "new" }); setFormKey((k) => k + 1); }} />
              </section>
            )}

            {me.role === "operator" && mine.length > 0 && (
              <section className="rounded-xl border border-slate-200 bg-white p-5">
                <h2 className="mb-3 text-sm font-semibold text-slate-800">Your entries</h2>
                <ul className="space-y-3">
                  {mine.map((e) => (
                    <EntryCard key={e.id} as={as} me={me} e={e} busy={busy}>
                      {(e.status === "returned" || e.status === "pending_verification") && (
                        <div className="flex flex-wrap gap-2">
                          {e.status === "returned" && (
                            <button onClick={() => { setMode({ kind: "resubmit", entry: e }); setFormKey((k) => k + 1); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="rounded bg-nnm-blue px-3 py-1 text-xs font-semibold text-white">
                              Correct &amp; resubmit
                            </button>
                          )}
                          <button
                            disabled={busy}
                            onClick={() => window.confirm("Withdraw this entry?") && run(() => withdrawWhosWhoEntry(as, e.id), "Entry withdrawn.")}
                            className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700"
                          >
                            Withdraw
                          </button>
                        </div>
                      )}
                    </EntryCard>
                  ))}
                </ul>
              </section>
            )}

            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="mb-3 text-sm font-semibold text-slate-800">Status by position</h2>
              <Tracker me={me} entries={list} />
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-800">{showAll && me.role !== "operator" ? "All entries" : `On the website now (${published.length})`}</h2>
                {me.role !== "operator" && (
                  <button onClick={() => setShowAll((s) => !s)} className="text-xs text-nnm-blue hover:underline">
                    {showAll ? "Show published only" : "Show all entries (incl. archived)"}
                  </button>
                )}
              </div>
              {(showAll && me.role !== "operator" ? list : published).length === 0 ? (
                <p className="text-sm text-slate-400">Nothing yet.</p>
              ) : (
                <ul className="space-y-3">
                  {(showAll && me.role !== "operator" ? list : published).map((e) => (
                    <EntryCard key={e.id} as={as} me={me} e={e} busy={busy}>
                      {me.role === "publisher" && e.status === "published" && <ReviewActions me={me} e={e} busy={busy} onAct={act} />}
                      {me.role === "operator" && e.status === "published" &&
                        (openReplacementFor.has(e.id) ? (
                          <p className="text-xs text-slate-500">An update for this entry is in progress.</p>
                        ) : (
                          <button onClick={() => { setMode({ kind: "update", entry: e }); setFormKey((k) => k + 1); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="rounded border border-nnm-blue px-3 py-1 text-xs font-semibold text-nnm-blue">
                            Enter an update (new form)
                          </button>
                        ))}
                    </EntryCard>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

export default function WhosWhoManagerPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>}>
      <Inner />
    </Suspense>
  );
}
