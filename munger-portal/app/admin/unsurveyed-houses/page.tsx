"use client";

import { useEffect, useState } from "react";
import { AlertCircle, ExternalLink, Image as ImageIcon, Loader2 } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { PhotoDialog } from "@/components/admin/field-capture";
import { useAdminGuard } from "@/lib/use-admin-guard";
import { fetchUnsurveyedHousePhoto, fetchUnsurveyedHouses, type UnsurveyedHouse } from "@/lib/collector-field-api";

const ALLOWED = ["tax_collector", "tax_daroga", "city_manager", "deputy_commissioner", "commissioner"];

export default function UnsurveyedHousesPage() {
  const admin = useAdminGuard();
  const [houses, setHouses] = useState<UnsurveyedHouse[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wardFilter, setWardFilter] = useState("");
  const [photo, setPhoto] = useState<{ url: string; title: string } | null>(null);

  useEffect(() => {
    if (!admin || !ALLOWED.includes(admin.role)) return;
    setHouses(null);
    fetchUnsurveyedHouses(wardFilter)
      .then(setHouses)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load the list."));
  }, [admin, wardFilter]);

  if (!admin) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;

  async function openPhoto(h: UnsurveyedHouse) {
    try {
      setPhoto({ url: await fetchUnsurveyedHousePhoto(h.id), title: `Ward ${h.ward} - ${h.locality}${h.house_no ? ` - ${h.house_no}` : ""}` });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load this photo.");
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="mb-1 text-2xl font-semibold text-slate-900">Houses Not Yet Surveyed</h1>
        <p className="mb-5 text-sm text-slate-500">
          Houses found on the ground by Tax Collectors that are in neither the holding database nor the MUNG-MIG data - not in the demand register.
          {admin.role === "tax_collector" ? " You see the houses you recorded." : ""} This list is read-only.
        </p>

        {!ALLOWED.includes(admin.role) ? (
          <div role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            You don&apos;t have access to this list.
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-center gap-2">
              <label className="text-xs font-medium text-slate-500">Ward</label>
              <input value={wardFilter} onChange={(e) => setWardFilter(e.target.value)} className="w-24 rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="All" />
              {houses && <span className="text-xs text-slate-500">{houses.length} house(s)</span>}
            </div>

            {error && (
              <div role="alert" className="mb-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            {!houses && !error ? (
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading…
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Ward</th>
                      <th className="px-3 py-2">Locality / Address</th>
                      <th className="px-3 py-2">House no</th>
                      <th className="px-3 py-2">Landmark</th>
                      <th className="px-3 py-2">Owner</th>
                      <th className="px-3 py-2">Recorded by</th>
                      <th className="px-3 py-2">Location</th>
                      <th className="px-3 py-2">Photo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(houses ?? []).map((h) => (
                      <tr key={h.id} className="border-t border-slate-100 align-top">
                        <td className="px-3 py-2">{h.ward}</td>
                        <td className="px-3 py-2">
                          <div className="font-medium text-slate-800">{h.locality}</div>
                          <div className="text-xs text-slate-500">{h.address}</div>
                        </td>
                        <td className="px-3 py-2">{h.house_no ?? "-"}</td>
                        <td className="px-3 py-2">{h.landmark ?? "-"}</td>
                        <td className="px-3 py-2">{h.owner_name ?? "-"}</td>
                        <td className="px-3 py-2">
                          <div>{h.recorded_by_display_name}</div>
                          <div className="text-xs text-slate-400">{new Date(h.recorded_at).toLocaleString("en-IN")}</div>
                        </td>
                        <td className="px-3 py-2">
                          <a
                            href={`https://www.google.com/maps?q=${h.latitude},${h.longitude}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-semibold text-nnm-blue hover:underline"
                          >
                            Map <ExternalLink className="h-3 w-3" />
                          </a>
                        </td>
                        <td className="px-3 py-2">
                          <button onClick={() => openPhoto(h)} className="inline-flex items-center gap-1 text-xs font-semibold text-nnm-blue hover:underline">
                            <ImageIcon className="h-3.5 w-3.5" /> View
                          </button>
                        </td>
                      </tr>
                    ))}
                    {houses && houses.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-3 py-8 text-center text-sm text-slate-400">
                          No houses recorded yet.
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
