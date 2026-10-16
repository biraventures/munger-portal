"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { useAdminGuard } from "@/lib/use-admin-guard";
import { getCurrentGpsPosition } from "@/lib/geolocation";
import { sanitizeHoldingNoInput } from "@/lib/holding-no";
import { currentFinancialYear, licenseYearOptions, readLicenceFile, submitTlSurvey, validTillOptions, type FileUpload } from "@/lib/tl-notice-api";

const input = "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-nnm-blue focus:outline-none";
const label = "mb-1 block text-xs font-medium text-slate-600";

export default function TlSurveyPage() {
  const admin = useAdminGuard();
  const fy = currentFinancialYear();
  const [hasLicense, setHasLicense] = useState<boolean | null>(null);
  const [holdingNo, setHoldingNo] = useState("");
  const [licenseYear, setLicenseYear] = useState(fy);
  const [validTill, setValidTill] = useState("");
  const [licenseNo, setLicenseNo] = useState("");
  const [photo, setPhoto] = useState<FileUpload | null>(null);
  const [photoName, setPhotoName] = useState("");
  const [personName, setPersonName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [isNnmShop, setIsNnmShop] = useState<boolean | null>(null);
  const [nnmShopNo, setNnmShopNo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ status: string; noticeNo: string | null } | null>(null);

  if (!admin) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  if (admin.role !== "tax_collector") {
    return (
      <div className="min-h-screen bg-slate-50">
        <AdminHeader admin={admin} />
        <p className="p-10 text-sm text-slate-500">This page is for Tax Collectors.</p>
      </div>
    );
  }

  const expired = hasLicense === true && validTill !== "" && validTill < fy;
  const needsNotice = hasLicense === false || expired;

  function reset() {
    setHasLicense(null);
    setHoldingNo("");
    setLicenseYear(fy);
    setValidTill("");
    setLicenseNo("");
    setPhoto(null);
    setPhotoName("");
    setPersonName("");
    setBusinessName("");
    setAddress("");
    setPhone("");
    setIsNnmShop(null);
    setNnmShopNo("");
    setDone(null);
    setError(null);
  }

  async function onFile(file: File | undefined) {
    setError(null);
    if (!file) return;
    try {
      setPhoto(await readLicenceFile(file));
      setPhotoName(file.name);
    } catch (err) {
      setPhoto(null);
      setError(err instanceof Error ? err.message : "Could not read the file.");
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (isNnmShop === null) return setError("Answer whether it is a Nagar Nigam Munger stall/shop.");
    if (hasLicense && !validTill) return setError("Choose the year the licence is valid till.");
    if (hasLicense && !photo) return setError("Upload a photo of the trade licence.");
    if (needsNotice && !/^[6-9]\d{9}$/.test(phone)) return setError("Enter a valid 10-digit phone number.");
    setBusy(true);
    try {
      const gps = await getCurrentGpsPosition().catch(() => null);
      const r = await submitTlSurvey({
        holdingNo: holdingNo.trim(),
        hasLicense: !!hasLicense,
        licenseYear: hasLicense ? licenseYear : null,
        licenseValidTill: hasLicense ? validTill : null,
        licenseNo: hasLicense ? licenseNo.trim() || null : null,
        licensePhoto: hasLicense ? photo : null,
        personName: needsNotice ? personName.trim() : null,
        businessName: needsNotice ? businessName.trim() : null,
        address: needsNotice ? address.trim() : null,
        phone: needsNotice ? phone : null,
        isNnmShop,
        nnmShopNo: isNnmShop ? nnmShopNo.trim() || null : null,
        latitude: gps?.lat ?? null,
        longitude: gps?.lng ?? null,
      });
      setDone(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />
      <main className="mx-auto max-w-xl px-4 py-8 sm:px-6">
        <h1 className="mb-1 text-2xl font-semibold text-slate-900">Trade Licence Check</h1>
        <p className="mb-6 text-sm text-slate-500">
          Record a business visit. Without a trade licence for {fy}, a notice is generated automatically — print it from{" "}
          <Link href="/admin/tl-notices-print" className="font-semibold text-nnm-blue hover:underline">
            Print Trade Licence Notices
          </Link>{" "}
          at the end of the day.
        </p>

        {done ? (
          <div className="space-y-4 rounded-xl border border-green-200 bg-green-50 p-5 text-sm text-green-800">
            <p className="flex items-center gap-2 font-semibold">
              <CheckCircle2 className="h-5 w-5" /> Saved.
            </p>
            {done.noticeNo ? (
              <p>
                Notice <b className="font-mono">{done.noticeNo}</b> has been generated (14 days to obtain the licence). It is in today&apos;s print list.
              </p>
            ) : (
              <p>Valid licence recorded — no notice needed.</p>
            )}
            <button onClick={reset} className="rounded-md bg-nnm-blue px-4 py-2 text-sm font-semibold text-white">
              Next business
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-5 rounded-xl border border-slate-200 bg-white p-5">
            {error && (
              <div role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <div>
              <p className={label}>Does the business have a trade licence?</p>
              <div className="flex gap-2">
                {[
                  { v: true, t: "Yes" },
                  { v: false, t: "No" },
                ].map((o) => (
                  <button
                    type="button"
                    key={o.t}
                    onClick={() => setHasLicense(o.v)}
                    className={`flex-1 rounded-md px-4 py-2 text-sm font-semibold ${hasLicense === o.v ? "bg-nnm-blue text-white" : "border border-slate-300 bg-white text-slate-700"}`}
                  >
                    {o.t}
                  </button>
                ))}
              </div>
            </div>

            {hasLicense !== null && (
              <>
                <div>
                  <label className={label}>Holding number</label>
                  <input value={holdingNo} onChange={(e) => setHoldingNo(sanitizeHoldingNoInput(e.target.value))} required maxLength={32} className={input} />
                </div>

                <div>
                  <p className={label}>Is it a stall / shop of Nagar Nigam Munger?</p>
                  <div className="flex gap-2">
                    {[
                      { v: true, t: "Yes" },
                      { v: false, t: "No" },
                    ].map((o) => (
                      <button
                        type="button"
                        key={o.t}
                        onClick={() => setIsNnmShop(o.v)}
                        className={`flex-1 rounded-md px-4 py-2 text-sm font-semibold ${isNnmShop === o.v ? "bg-nnm-blue text-white" : "border border-slate-300 bg-white text-slate-700"}`}
                      >
                        {o.t}
                      </button>
                    ))}
                  </div>
                  {isNnmShop && (
                    <input value={nnmShopNo} onChange={(e) => setNnmShopNo(e.target.value)} maxLength={50} placeholder="Stall / shop number" className={`${input} mt-2`} />
                  )}
                </div>

                {hasLicense && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={label}>Year of trade licence</label>
                        <select
                          value={licenseYear}
                          onChange={(e) => {
                            setLicenseYear(e.target.value);
                            if (validTill && validTill < e.target.value) setValidTill("");
                          }}
                          className={input}
                        >
                          {licenseYearOptions().map((y) => (
                            <option key={y} value={y}>
                              {y}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={label}>Valid till (year)</label>
                        <select value={validTill} onChange={(e) => setValidTill(e.target.value)} required className={input}>
                          <option value="">Choose…</option>
                          {validTillOptions(licenseYear).map((y) => (
                            <option key={y} value={y}>
                              {y}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-2">
                        <label className={label}>Licence number (optional)</label>
                        <input value={licenseNo} onChange={(e) => setLicenseNo(e.target.value)} maxLength={50} className={input} />
                      </div>
                    </div>
                    <div>
                      <label className={label}>Photo of the trade licence</label>
                      <input type="file" accept="image/jpeg,image/png,application/pdf" capture="environment" onChange={(e) => onFile(e.target.files?.[0])} className="text-sm" />
                      {photoName && <p className="mt-1 text-xs text-green-700">✓ {photoName}</p>}
                    </div>
                    {expired && (
                      <p className="rounded-md bg-amber-50 p-3 text-xs text-amber-800">
                        The licence was valid only till {validTill}, before the current year {fy} — a notice will be issued to renew it. Fill in the details below.
                      </p>
                    )}
                  </>
                )}

                {needsNotice && (
                  <>
                    <div>
                      <label className={label}>Name of person</label>
                      <input value={personName} onChange={(e) => setPersonName(e.target.value)} required maxLength={255} className={input} />
                    </div>
                    <div>
                      <label className={label}>Name of business</label>
                      <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} required maxLength={255} className={input} />
                    </div>
                    <div>
                      <label className={label}>Address</label>
                      <textarea value={address} onChange={(e) => setAddress(e.target.value)} required maxLength={500} rows={2} className={input} />
                    </div>
                    <div>
                      <label className={label}>Phone number</label>
                      <input
                        value={phone}
                        onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                        required
                        inputMode="numeric"
                        className={input}
                      />
                    </div>
                  </>
                )}

                <button type="submit" disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-nnm-blue px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  {needsNotice ? "Save & generate notice" : "Save"}
                </button>
              </>
            )}
          </form>
        )}
      </main>
    </div>
  );
}
