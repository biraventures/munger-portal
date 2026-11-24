"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { AttendanceHeader } from "@/components/attendance/attendance-header";
import { useAttendanceGuard } from "@/lib/use-attendance-guard";
import type { AttendanceRole } from "@/lib/attendance-auth";
import {
  ENGINEER_LABELS,
  ENGINEER_ROLES,
  PROJECT_ADMIN_ROLES,
  assignWards,
  fetchEngineerSetup,
  type EngineerRole,
  type EngineerSetup,
} from "@/lib/project-api";
import { BackLink, Card, ErrorLine, Spinner, inputClass, labelClass, primaryBtn } from "@/components/projects/parts";

/** The Commissioner assigns each ward its JE / AE (Civil) and JE / AE (Mechanical). */
export default function EngineerWardsPage() {
  const user = useAttendanceGuard(PROJECT_ADMIN_ROLES as AttendanceRole[]);
  const [setup, setSetup] = useState<EngineerSetup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Several wards at once.
  const [role, setRole] = useState<EngineerRole>("je_civil");
  const [userId, setUserId] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (user)
      fetchEngineerSetup()
        .then(setSetup)
        .catch((e) => setError(e.message));
  }, [user]);

  const assigned = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of setup?.assignments ?? []) m.set(`${a.ward_id}|${a.role}`, String(a.user_id));
    return m;
  }, [setup]);

  async function run(fn: () => Promise<EngineerSetup>) {
    setBusy(true);
    setError(null);
    try {
      setSetup(await fn());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  if (!user) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading...</div>;
  const engineersOf = (r: EngineerRole) => setup?.engineers.filter((e) => e.role === r) ?? [];

  return (
    <div className="min-h-screen bg-slate-50">
      <AttendanceHeader user={user} />
      <main className="mx-auto max-w-7xl space-y-5 px-4 py-8 sm:px-6">
        <BackLink href="/attendance/projects" label="Projects" />
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Assign wards to JE / AE</h1>
          <p className="text-sm text-slate-500">
            A project goes to its ward&apos;s engineers of its type - civil, mechanical or both. You can still name a different engineer on
            any project.
          </p>
        </div>
        <ErrorLine error={error} />
        {!setup ? (
          <Spinner />
        ) : (
          <>
            {setup.engineers.length === 0 && (
              <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
                No JE / AE logins yet. Create them on the server with: npm run create-attendance-user -- &lt;username&gt; &lt;password&gt;
                &quot;&lt;Name&gt;&quot; je_civil (or je_mechanical, ae_civil, ae_mechanical).
              </p>
            )}
            <Card title="Assign several wards at once">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className={labelClass}>Engineer kind</label>
                  <select
                    className={inputClass}
                    value={role}
                    onChange={(e) => {
                      setRole(e.target.value as EngineerRole);
                      setUserId("");
                    }}
                  >
                    {ENGINEER_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ENGINEER_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Engineer</label>
                  <select className={inputClass} value={userId} onChange={(e) => setUserId(e.target.value)}>
                    <option value="">Nobody (clear)</option>
                    {engineersOf(role).map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.display_name} ({e.username})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end">
                  <button
                    className={primaryBtn}
                    disabled={busy || picked.size === 0}
                    onClick={() =>
                      run(async () => {
                        const r = await assignWards(role, [...picked].map(Number), userId ? Number(userId) : null);
                        setPicked(new Set());
                        return r;
                      })
                    }
                  >
                    {busy && <Loader2 className="h-4 w-4 animate-spin" />} Apply to {picked.size} ward{picked.size === 1 ? "" : "s"}
                  </button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  className="text-xs text-nnm-blue hover:underline"
                  onClick={() => setPicked(new Set(setup.wards.map((w) => String(w.id))))}
                >
                  Select all
                </button>
                <button className="text-xs text-nnm-blue hover:underline" onClick={() => setPicked(new Set())}>
                  Clear
                </button>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-1.5 sm:grid-cols-6 lg:grid-cols-9">
                {setup.wards.map((w) => {
                  const on = picked.has(String(w.id));
                  return (
                    <label
                      key={w.id}
                      className={`flex cursor-pointer items-center gap-1.5 rounded border px-2 py-1 text-xs ${on ? "border-nnm-blue bg-blue-50" : "border-slate-200"}`}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() =>
                          setPicked((s) => {
                            const n = new Set(s);
                            if (on) n.delete(String(w.id));
                            else n.add(String(w.id));
                            return n;
                          })
                        }
                      />
                      {w.ward_name}
                    </label>
                  );
                })}
              </div>
            </Card>

            <Card title="Ward by ward">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="py-2 pr-3">Ward</th>
                      {ENGINEER_ROLES.map((r) => (
                        <th key={r} className="py-2 pr-3">
                          {ENGINEER_LABELS[r]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {setup.wards.map((w) => (
                      <tr key={w.id} className="border-b border-slate-100">
                        <td className="py-1.5 pr-3 font-medium whitespace-nowrap">{w.ward_name}</td>
                        {ENGINEER_ROLES.map((r) => (
                          <td key={r} className="py-1.5 pr-3">
                            <select
                              className={`${inputClass} py-1.5`}
                              disabled={busy}
                              value={assigned.get(`${w.id}|${r}`) ?? ""}
                              onChange={(e) => run(() => assignWards(r, [Number(w.id)], e.target.value ? Number(e.target.value) : null))}
                            >
                              <option value="">-</option>
                              {engineersOf(r).map((e) => (
                                <option key={e.id} value={e.id}>
                                  {e.display_name}
                                </option>
                              ))}
                            </select>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
