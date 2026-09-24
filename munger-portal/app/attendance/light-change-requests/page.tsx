"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, PlusCircle, XCircle } from "lucide-react";
import { AttendanceHeader } from "@/components/attendance/attendance-header";
import { useAttendanceGuard } from "@/lib/use-attendance-guard";
import { fetchAttendanceWards, type AttendanceWard } from "@/lib/attendance-api";
import {
  requestLightChange,
  fetchLightChangeRequests,
  approveLightChange,
  rejectLightChange,
  fetchLights,
  fetchInstallationAgencies,
  type LightChangeRequest,
  type LightChangeActionType,
  type StreetLight,
  type InstallationAgency,
} from "@/lib/streetlight-api";

const inputClass = "w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1";
const REQUESTER_ROLES = ["streetlight_je", "streetlight_ae", "streetlight_nodal_clerk", "streetlight_contractor"];
const APPROVER_ROLES = ["city_manager", "deputy_municipal_commissioner", "municipal_commissioner"];
const ACTION_LABELS: Record<LightChangeActionType, string> = {
  add: "Add new light",
  status_change: "Change functionality status",
  deactivate: "Deactivate",
  reactivate: "Reactivate",
  delete: "Delete",
};

export default function LightChangeRequestsPage() {
  const attendance = useAttendanceGuard();
  const [requests, setRequests] = useState<LightChangeRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<number | null>(null);
  const [notesById, setNotesById] = useState<Record<number, string>>({});

  // --- propose form ---
  const [proposing, setProposing] = useState(false);
  const [actionType, setActionType] = useState<LightChangeActionType>("status_change");
  const [lights, setLights] = useState<StreetLight[]>([]);
  const [selectedLightId, setSelectedLightId] = useState<number | "">("");
  const [newStatus, setNewStatus] = useState<"working" | "not_working" | "automatic" | "joint">("not_working");
  const [reason, setReason] = useState("");
  const [wards, setWards] = useState<AttendanceWard[]>([]);
  const [agencies, setAgencies] = useState<InstallationAgency[]>([]);
  const [addWardId, setAddWardId] = useState<number | "">("");
  const [addLocality, setAddLocality] = useState("");
  const [addSerial, setAddSerial] = useState("");
  const [addAgencyId, setAddAgencyId] = useState<number | "">("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  function load() {
    fetchLightChangeRequests("pending")
      .then(setRequests)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load requests."));
  }

  useEffect(() => {
    if (!attendance) return;
    load();
    if (REQUESTER_ROLES.includes(attendance.role)) {
      fetchLights().then(setLights).catch(() => setLights([]));
      fetchAttendanceWards().then(setWards).catch(() => setWards([]));
      fetchInstallationAgencies().then(setAgencies).catch(() => setAgencies([]));
    }
  }, [attendance]);

  async function handlePropose() {
    if (!reason.trim()) {
      setError("A reason is required.");
      return;
    }
    let proposedData: Record<string, unknown> | null = null;
    let lightId: number | null = null;

    if (actionType === "add") {
      if (!addWardId || !addLocality.trim() || !addSerial.trim()) {
        setError("Ward, locality, and serial number are required to add a light.");
        return;
      }
      proposedData = { lightType: "streetlight", wardId: addWardId, localityName: addLocality.trim(), serialNumber: addSerial.trim(), installationAgencyId: addAgencyId || null };
    } else {
      if (!selectedLightId) {
        setError("Choose a light.");
        return;
      }
      lightId = selectedLightId;
      if (actionType === "status_change") proposedData = { switchStatus: newStatus };
    }

    setSubmitting(true);
    setError(null);
    try {
      await requestLightChange({ actionType, lightId, proposedData, reason: reason.trim() });
      setSuccess(true);
      setProposing(false);
      setReason("");
      setSelectedLightId("");
      setAddWardId("");
      setAddLocality("");
      setAddSerial("");
      setAddAgencyId("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit this request.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleApprove(id: number) {
    setActing(id);
    setError(null);
    try {
      await approveLightChange(id, notesById[id]?.trim() || null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not approve this request.");
    } finally {
      setActing(null);
    }
  }

  async function handleReject(id: number) {
    const notes = notesById[id]?.trim();
    if (!notes) {
      setError("A reason is required to reject.");
      return;
    }
    setActing(id);
    setError(null);
    try {
      await rejectLightChange(id, notes);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reject this request.");
    } finally {
      setActing(null);
    }
  }

  if (!attendance) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  const canPropose = REQUESTER_ROLES.includes(attendance.role);
  const canApprove = APPROVER_ROLES.includes(attendance.role);

  if (!canPropose && !canApprove) {
    return (
      <div className="min-h-screen bg-slate-50">
        <AttendanceHeader user={attendance} />
        <main className="mx-auto max-w-2xl px-6 py-10">
          <div role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            This section isn&apos;t available for your role.
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AttendanceHeader user={attendance} />

      <main className="mx-auto max-w-3xl px-6 py-10">
        <div className="mb-1 flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-slate-900">Light Change Requests</h1>
          {canPropose && !proposing && (
            <button
              onClick={() => {
                setProposing(true);
                setSuccess(false);
              }}
              className="inline-flex items-center gap-1.5 rounded-md bg-nnm-blue px-3 py-1.5 text-xs font-semibold text-white hover:bg-nnm-blue-dark"
            >
              <PlusCircle className="h-3.5 w-3.5" />
              New Request
            </button>
          )}
        </div>
        <p className="mb-6 text-sm text-slate-500">Add, change status of, deactivate, reactivate, or delete a light - approved through City Manager, DMC, then Municipal Commissioner.</p>

        {error && (
          <div role="alert" className="mb-5 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}
        {success && (
          <div role="status" className="mb-5 flex items-center gap-2 rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Request submitted.
          </div>
        )}

        {proposing && (
          <div className="mb-6 rounded-xl border border-slate-200 bg-white p-6">
            <label className="mb-1 block text-xs font-medium text-slate-600">Action</label>
            <select value={actionType} onChange={(e) => setActionType(e.target.value as LightChangeActionType)} className={`${inputClass} mb-4`}>
              <option value="status_change">Change functionality status</option>
              <option value="deactivate">Deactivate</option>
              <option value="reactivate">Reactivate</option>
              <option value="delete">Delete</option>
              <option value="add">Add new light</option>
            </select>

            {actionType === "add" ? (
              <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <select value={addWardId} onChange={(e) => setAddWardId(e.target.value ? Number(e.target.value) : "")} className={inputClass}>
                  <option value="">Choose ward…</option>
                  {wards.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.wardName}
                    </option>
                  ))}
                </select>
                <select value={addAgencyId} onChange={(e) => setAddAgencyId(e.target.value ? Number(e.target.value) : "")} className={inputClass}>
                  <option value="">Choose agency…</option>
                  {agencies.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.agencyName}
                    </option>
                  ))}
                </select>
                <input placeholder="Locality name" value={addLocality} onChange={(e) => setAddLocality(e.target.value)} className={inputClass} />
                <input placeholder="Serial number" value={addSerial} onChange={(e) => setAddSerial(e.target.value)} className={inputClass} />
              </div>
            ) : (
              <>
                <label className="mb-1 block text-xs font-medium text-slate-600">Light</label>
                <select value={selectedLightId} onChange={(e) => setSelectedLightId(e.target.value ? Number(e.target.value) : "")} className={`${inputClass} mb-4`}>
                  <option value="">Choose a light…</option>
                  {lights.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.serialNumber}
                    </option>
                  ))}
                </select>
              </>
            )}

            {actionType === "status_change" && (
              <>
                <label className="mb-1 block text-xs font-medium text-slate-600">New status</label>
                <select value={newStatus} onChange={(e) => setNewStatus(e.target.value as typeof newStatus)} className={`${inputClass} mb-4`}>
                  <option value="working">Working</option>
                  <option value="not_working">Not Working</option>
                  <option value="automatic">Automatic</option>
                  <option value="joint">Joint</option>
                </select>
              </>
            )}

            <label className="mb-1 block text-xs font-medium text-slate-600">Reason</label>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className={`${inputClass} mb-4`} />

            <div className="flex gap-2">
              <button onClick={handlePropose} disabled={submitting} className="rounded-md bg-nnm-blue px-4 py-2 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60">
                {submitting ? "Submitting…" : "Submit Request"}
              </button>
              <button onClick={() => setProposing(false)} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                Cancel
              </button>
            </div>
          </div>
        )}

        {!requests ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : requests.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-400">Nothing pending.</div>
        ) : (
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {requests.map((r) => (
              <div key={r.id} className="p-4">
                <p className="text-sm font-semibold text-slate-800">{ACTION_LABELS[r.action_type]}</p>
                <p className="text-xs text-slate-500">
                  Stage: {r.current_stage.replace(/_/g, " ")} · {r.reason}
                </p>
                {canApprove && r.current_stage === attendance.role && (
                  <div className="mt-2">
                    <textarea
                      value={notesById[r.id] ?? ""}
                      onChange={(e) => setNotesById((prev) => ({ ...prev, [r.id]: e.target.value }))}
                      rows={2}
                      placeholder="Notes (required to reject)"
                      className={`${inputClass} mb-2`}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleApprove(r.id)}
                        disabled={acting === r.id}
                        className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-60"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Approve
                      </button>
                      <button
                        onClick={() => handleReject(r.id)}
                        disabled={acting === r.id}
                        className="inline-flex items-center gap-1.5 rounded-md border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Reject
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
