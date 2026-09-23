"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Camera, Loader2, Trash2, X } from "lucide-react";
import { AttendanceHeader } from "@/components/attendance/attendance-header";
import { useAttendanceGuard } from "@/lib/use-attendance-guard";
import { fetchAllWardPhotos, fetchWardPhotoBlobUrl, deleteWardPhoto, type WardPhotoInfo } from "@/lib/attendance-api";

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function AttendancePhotosPage() {
  const user = useAttendanceGuard(["sanitation_officer", "sanitation_prabhari", "attendance_admin"]);
  const [date, setDate] = useState(todayIsoDate());
  const [wards, setWards] = useState<WardPhotoInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openPhotoUrl, setOpenPhotoUrl] = useState<string | null>(null);
  const [openPhotoWard, setOpenPhotoWard] = useState<{ id: number; name: string } | null>(null);
  const [loadingPhotoWardId, setLoadingPhotoWardId] = useState<number | null>(null);
  const [deletingWardId, setDeletingWardId] = useState<number | null>(null);

  async function loadWards() {
    setError(null);
    try {
      const list = await fetchAllWardPhotos(date);
      setWards(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load ward photo statuses.");
    }
  }

  useEffect(() => {
    if (!user) return;
    loadWards();
    // date changes are handled by the explicit "Refresh" button below to avoid re-fetching on every keystroke of a date input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function handleViewPhoto(wardId: number, wardName: string) {
    setLoadingPhotoWardId(wardId);
    setError(null);
    try {
      const url = await fetchWardPhotoBlobUrl(wardId, date);
      setOpenPhotoUrl(url);
      setOpenPhotoWard({ id: wardId, name: wardName });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load this photo.");
    } finally {
      setLoadingPhotoWardId(null);
    }
  }

  function closeModal() {
    if (openPhotoUrl) URL.revokeObjectURL(openPhotoUrl);
    setOpenPhotoUrl(null);
    setOpenPhotoWard(null);
  }

  async function handleDeletePhoto(wardId: number, wardName: string) {
    if (!confirm(`Delete ${wardName}'s photo for ${date}? This can't be undone.`)) return;
    setDeletingWardId(wardId);
    setError(null);
    try {
      await deleteWardPhoto(wardId, date);
      if (openPhotoWard?.id === wardId) closeModal();
      await loadWards();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete this photo.");
    } finally {
      setDeletingWardId(null);
    }
  }

  const canDelete = user?.role === "attendance_admin";

  if (!user) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AttendanceHeader user={user} />

      <main className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="mb-1 text-2xl font-semibold text-slate-900">Daily Group Photos</h1>
        <p className="mb-6 text-sm text-slate-500">One photo per ward per day, uploaded by that ward&apos;s Jamadar.</p>

        <div className="mb-6 flex items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1"
            />
          </div>
          <button
            onClick={loadWards}
            className="rounded-md bg-nnm-blue px-5 py-2 text-sm font-semibold text-white hover:bg-nnm-blue-dark"
          >
            Refresh
          </button>
        </div>

        {error && (
          <div role="alert" className="mb-5 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {!wards ? (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading...
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {wards.map((w) => (
              <div key={w.wardId} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Camera className={`h-4 w-4 ${w.path ? "text-green-600" : "text-slate-300"}`} />
                    <span className="font-semibold text-slate-900">{w.wardName}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {w.path ? `Uploaded by ${w.uploadedBy}` : "Not uploaded yet"}
                  </p>
                </div>
                {w.path && (
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      onClick={() => handleViewPhoto(w.wardId, w.wardName)}
                      disabled={loadingPhotoWardId === w.wardId}
                      className="inline-flex items-center gap-1.5 rounded border border-nnm-blue px-2.5 py-1.5 text-xs font-semibold text-nnm-blue hover:bg-blue-50 disabled:opacity-60"
                    >
                      {loadingPhotoWardId === w.wardId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "View"}
                    </button>
                    {canDelete && (
                      <button
                        onClick={() => handleDeletePhoto(w.wardId, w.wardName)}
                        disabled={deletingWardId === w.wardId}
                        className="inline-flex items-center gap-1.5 rounded border border-red-300 px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
                      >
                        {deletingWardId === w.wardId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      {openPhotoUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={closeModal}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700">
                {openPhotoWard?.name} - {date}
              </h2>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element -- object URL from an authenticated fetch, not a static asset next/image can optimize */}
            <img src={openPhotoUrl} alt={`${openPhotoWard?.name} group photo`} className="max-h-[75vh] w-full rounded-md object-contain" />
          </div>
        </div>
      )}
    </div>
  );
}
