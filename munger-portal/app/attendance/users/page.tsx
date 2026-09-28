"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, UserPlus } from "lucide-react";
import { AttendanceHeader } from "@/components/attendance/attendance-header";
import { useAttendanceGuard } from "@/lib/use-attendance-guard";
import { ATTENDANCE_ROLE_LABELS, WARD_SCOPED_ROLES, type AttendanceRole } from "@/lib/attendance-auth";
import {
  fetchAttendanceWards,
  fetchAttendanceUsers,
  createAttendanceUserApi,
  setAttendanceUserActive,
  type AttendanceWard,
  type AttendanceUserSummary,
} from "@/lib/attendance-api";

const inputClass =
  "w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1";
const labelClass = "mb-1.5 block text-sm font-medium text-slate-700";

const ALL_ROLES: AttendanceRole[] = [
  "jamadar",
  "driver_supervisor",
  "sanitation_officer",
  "sanitation_prabhari",
  "attendance_admin",
  "ward_parshad",
  "mayor",
  "deputy_mayor",
];

export default function AttendanceUsersPage() {
  const user = useAttendanceGuard(["attendance_admin"]);
  const [wards, setWards] = useState<AttendanceWard[]>([]);
  const [users, setUsers] = useState<AttendanceUserSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<AttendanceRole>("jamadar");
  const [wardId, setWardId] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [created, setCreated] = useState(false);

  const needsWard = WARD_SCOPED_ROLES.includes(role);

  async function loadUsers() {
    try {
      setUsers(await fetchAttendanceUsers());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load users.");
    }
  }

  useEffect(() => {
    if (!user) return;
    fetchAttendanceWards()
      .then(setWards)
      .catch(() => setWards([]));
    loadUsers();
  }, [user]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    setCreated(false);

    if (needsWard && !wardId) {
      setCreateError(`Role "${ATTENDANCE_ROLE_LABELS[role]}" requires a ward.`);
      return;
    }

    setCreating(true);
    try {
      await createAttendanceUserApi({
        username,
        password,
        displayName,
        role,
        wardId: needsWard ? Number(wardId) : null,
      });
      setCreated(true);
      setUsername("");
      setPassword("");
      setDisplayName("");
      setWardId("");
      await loadUsers();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Could not create user.");
    } finally {
      setCreating(false);
    }
  }

  async function handleToggleActive(id: number, active: boolean) {
    setError(null);
    try {
      await setAttendanceUserActive(id, active);
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update user status.");
    }
  }

  if (!user) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AttendanceHeader user={user} />

      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="mb-1 text-2xl font-semibold text-slate-900">Manage Attendance Logins</h1>
        <p className="mb-6 text-sm text-slate-500">Create Jamadar, Driver Supervisor, Officer, Prabhari, or Admin accounts.</p>

        {error && (
          <div role="alert" className="mb-5 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <section className="mb-8 rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <UserPlus className="h-4 w-4" />
            Create New Login
          </h2>

          {createError && (
            <div role="alert" className="mb-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {createError}
            </div>
          )}
          {created && (
            <div role="status" className="mb-4 flex items-center gap-1.5 text-sm text-green-700">
              <CheckCircle2 className="h-4 w-4" />
              Login created.
            </div>
          )}

          <form onSubmit={handleCreate} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Username</label>
              <input required value={username} onChange={(e) => setUsername(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Temporary Password</label>
              <input required type="text" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Display Name</label>
              <input required value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Role</label>
              <select value={role} onChange={(e) => setRole(e.target.value as AttendanceRole)} className={inputClass}>
                {ALL_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ATTENDANCE_ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </div>
            {needsWard && (
              <div className="sm:col-span-2">
                <label className={labelClass}>Ward</label>
                <select required value={wardId} onChange={(e) => setWardId(e.target.value)} className={inputClass}>
                  <option value="">Select a ward...</option>
                  {wards.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.wardName}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={creating}
                className="w-full rounded-md bg-nnm-blue py-3 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60 sm:w-auto sm:px-8"
              >
                {creating ? "Creating..." : "Create Login"}
              </button>
            </div>
          </form>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="mb-4 text-sm font-semibold text-slate-700">All Logins</h2>
          {!users ? (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading...
            </div>
          ) : (
            <div className="overflow-hidden rounded-md border border-slate-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Username</th>
                    <th className="px-3 py-2 font-medium">Role</th>
                    <th className="px-3 py-2 font-medium">Ward</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-3 py-2">{u.displayName}</td>
                      <td className="px-3 py-2 font-mono text-xs">{u.username}</td>
                      <td className="px-3 py-2">{ATTENDANCE_ROLE_LABELS[u.role]}</td>
                      <td className="px-3 py-2">{u.wardName ?? "-"}</td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${u.active ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-500"}`}>
                          {u.active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => handleToggleActive(u.id, !u.active)}
                          className="text-xs font-medium text-nnm-blue hover:underline"
                        >
                          {u.active ? "Deactivate" : "Activate"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
