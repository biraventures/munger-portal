"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Image as ImageIcon, Loader2, Search } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { PhotoDialog } from "@/components/admin/field-capture";
import { useAdminGuard } from "@/lib/use-admin-guard";
import { sanitizeHoldingNoInput } from "@/lib/holding-no";
import { fetchReceivingCopies, fetchReceivingCopyPhoto, type ReceivingCopy } from "@/lib/collector-field-api";

const ALLOWED = ["tax_collector", "tax_daroga", "city_manager", "deputy_commissioner", "commissioner"];

export default function NoticeReceivingCopiesPage() {
  const admin = useAdminGuard();
  const [holdingNo, setHoldingNo] = useState("");
  const [appliedHolding, setAppliedHolding] = useState("");
  const [copies, setCopies] = useState<ReceivingCopy[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [photo, setPhoto] = useState<{ url: string; title: string } | null>(null);

  useEffect(() => {
    if (!admin || !ALLOWED.includes(admin.role)) return;
    setCopies(null);
    setError(null);
    fetchReceivingCopies(appliedHolding)
      .then(setCopies)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load the list."));
  }, [admin, appliedHolding]);

  if (!admin) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;

  async function openPhoto(c: ReceivingCopy) {
    try {
      setPhoto({ url: await fetchReceivingCopyPhoto(c.id), title: `${c.holding_no} - notice ${c.demand_no} - copy ${c.copy_no}` });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load this photo.");
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="mb-1 text-2xl font-semibold text-slate-900">Notice Receiving Copies</h1>
        <p className="mb-5 text-sm text-slate-500">
          Signed copies of printed demand notices uploaded by Tax Collectors.
          {admin.role === "tax_collector" ? " You see the copies you uploaded." : ""} This list is read-only; uploaded copies cannot be removed.
        </p>

        {!ALLOWED.includes(admin.role) ? (
          <div role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            You don&apos;t have access to this list.
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-end gap-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Holding number (optional)</label>
                <input
                  value={holdingNo}
                  onChange={(e) => setHoldingNo(sanitizeHoldingNoInput(e.target.value))}
                  onKeyDown={(e) => e.key === "Enter" && setAppliedHolding(holdingNo)}
                  className="w-56 rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <button onClick={() => setAppliedHolding(holdingNo)} className="inline-flex items-center gap-1.5 rounded-md bg-nnm-blue px-4 py-2 text-sm font-semibold text-white hover:bg-nnm-blue-dark">
                <Search className="h-4 w-4" />
                Filter
              </button>
              {copies && <span className="pb-2 text-xs text-slate-500">{copies.length} copy(ies)</span>}
            </div>

            {error && (
              <div role="alert" className="mb-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            {!copies && !error ? (
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading…
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Holding</th>
                      <th className="px-3 py-2">Owner</th>
                      <th className="px-3 py-2">Notice</th>
                      <th className="px-3 py-2">Copy</th>
                      <th className="px-3 py-2">Uploaded by</th>
                      <th className="px-3 py-2">Photo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(copies ?? []).map((c) => (
                      <tr key={c.id} className="border-t border-slate-100 align-top">
                        <td className="px-3 py-2">
                          <div className="font-medium text-slate-800">{c.holding_no}</div>
                          {c.ward && <div className="text-xs text-slate-400">Ward {c.ward}</div>}
                        </td>
                        <td className="px-3 py-2">{c.owner_name ?? "-"}</td>
                        <td className="px-3 py-2">
                          <div>{c.demand_no}</div>
                          <div className="text-xs text-slate-400">
                            {new Date(c.notice_date).toLocaleDateString("en-IN")} - ₹{c.total_amount_demanded}
                          </div>
                        </td>
                        <td className="px-3 py-2">{c.copy_no} of 2</td>
                        <td className="px-3 py-2">
                          <div>{c.uploaded_by_display_name}</div>
                          <div className="text-xs text-slate-400">{new Date(c.uploaded_at).toLocaleString("en-IN")}</div>
                        </td>
                        <td className="px-3 py-2">
                          <button onClick={() => openPhoto(c)} className="inline-flex items-center gap-1 text-xs font-semibold text-nnm-blue hover:underline">
                            <ImageIcon className="h-3.5 w-3.5" /> View
                          </button>
                        </td>
                      </tr>
                    ))}
                    {copies && copies.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-3 py-8 text-center text-sm text-slate-400">
                          No receiving copies uploaded yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </main>
      {photo && <PhotoDialog url={photo.url} title={photo.title} onClose={() => setPhoto(null)} />}
    </div>
  );
}
