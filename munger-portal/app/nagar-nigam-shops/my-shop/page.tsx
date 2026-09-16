"use client";

import { useState } from "react";
import { AlertCircle, Loader2, Printer, SearchX } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { lookupMyShopDetails, type MyShopDetails } from "@/lib/nagar-nigam-shops";

const inputClass =
  "w-full rounded-md border border-line bg-white px-3.5 py-2.5 text-sm text-ink outline-none placeholder:text-ink-soft/60 focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1";

function money(v: string | number | undefined | null): string {
  const n = Number(v ?? 0);
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function dateStr(v: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
}

type Status = "idle" | "loading" | "success" | "empty" | "error";

export default function MyShopDetailsPage() {
  const [shopNo, setShopNo] = useState("");
  const [mobileNo, setMobileNo] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [details, setDetails] = useState<MyShopDetails | null>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!shopNo.trim() || !mobileNo.trim()) return;
    setStatus("loading");
    try {
      const result = await lookupMyShopDetails(shopNo, mobileNo);
      setDetails(result);
      setStatus(result ? "success" : "empty");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; }
        }
      `}</style>

      <div className="no-print">
        <SiteHeader />
      </div>

      <main>
        <section className="no-print bg-gradient-to-br from-nnm-blue to-nnm-blue-dark py-16 text-white">
          <div className="mx-auto max-w-6xl px-6">
            <span className="mb-2.5 block font-mono text-[12.5px] uppercase tracking-[0.14em] text-nnm-gold">
              Nagar Nigam Shops
            </span>
            <h1 className="mb-3 font-display text-3xl font-semibold sm:text-4xl">Download My Shop Details</h1>
            <p className="max-w-xl text-[17px] text-white/80">
              Verify your shop number and registered mobile number to view and print your agreement details.
            </p>
          </div>
        </section>

        <section className="bg-paper-dim py-14">
          <div className="mx-auto max-w-2xl px-6">
            {!details && (
              <form onSubmit={handleSearch} className="no-print rounded-[10px] border border-line bg-card p-6 sm:p-7">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-ink">Shop number</label>
                    <input value={shopNo} onChange={(e) => setShopNo(e.target.value)} placeholder="e.g. NNC-1" className={inputClass} />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-ink">Registered mobile number</label>
                    <input value={mobileNo} onChange={(e) => setMobileNo(e.target.value)} placeholder="10-digit mobile number on file" className={inputClass} />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={status === "loading"}
                  className="mt-4 inline-flex items-center gap-2 rounded-md bg-nnm-blue px-6 py-2.5 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
                >
                  {status === "loading" && <Loader2 className="h-4 w-4 animate-spin" />}
                  {status === "loading" ? "Verifying…" : "Verify & View"}
                </button>
              </form>
            )}

            {status === "error" && (
              <div role="alert" className="no-print mt-5 flex items-center gap-2 rounded-[10px] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                Something went wrong. Please try again.
              </div>
            )}

            {status === "empty" && (
              <div className="no-print mt-5 flex items-start gap-3 rounded-[10px] border border-line bg-card p-5 text-sm text-ink-soft">
                <SearchX className="mt-0.5 h-5 w-5 shrink-0 text-ganga-teal" />
                <span>
                  No matching shop found. Please double-check both the shop number and the registered mobile number.
                </span>
              </div>
            )}

            {details && (
              <div>
                <div className="no-print mb-4 flex items-center justify-between">
                  <button
                    onClick={() => window.print()}
                    className="inline-flex items-center gap-2 rounded-md bg-nnm-blue px-5 py-2.5 text-sm font-semibold text-white hover:bg-nnm-blue-dark"
                  >
                    <Printer className="h-4 w-4" />
                    Print / Save as PDF
                  </button>
                  <button
                    onClick={() => {
                      setDetails(null);
                      setStatus("idle");
                    }}
                    className="text-sm font-medium text-nnm-blue hover:underline"
                  >
                    Search another shop
                  </button>
                </div>

                <div className="rounded-xl border border-line bg-white p-8 text-[12px] text-[#222]" style={{ fontFamily: "Arial, sans-serif" }}>
                  <div className="border-b-2 border-nnm-blue pb-2 text-center">
                    <h1 className="m-0 text-xl font-bold text-nnm-blue">MUNGER NAGAR NIGAM</h1>
                    <div className="text-[13px] text-slate-500">MY SHOP DETAILS</div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-1">
                    <div>
                      <b className="inline-block w-[150px]">Shop No</b> {details.shopNo}
                    </div>
                    <div>
                      <b className="inline-block w-[150px]">Agreement No</b> {details.agreementNumber ?? "—"}
                    </div>
                    <div>
                      <b className="inline-block w-[150px]">Market</b> {details.marketName ?? "—"}
                    </div>
                    <div>
                      <b className="inline-block w-[150px]">Location</b> {details.location}
                    </div>
                  </div>

                  <h2 className="mt-5 border-b border-slate-300 pb-1 text-[13px] font-bold text-nnm-blue">Holder Details</h2>
                  <div className="mt-2 grid grid-cols-2 gap-x-8 gap-y-1">
                    <div>
                      <b className="inline-block w-[150px]">Holder Name</b> {details.holderName}
                    </div>
                    <div>
                      <b className="inline-block w-[150px]">{details.holderRelationType ?? "Relation"}</b> {details.holderRelationName ?? "—"}
                    </div>
                    <div>
                      <b className="inline-block w-[150px]">Mobile No</b> {details.holderMobile ?? "—"}
                    </div>
                    <div className="col-span-2">
                      <b className="inline-block w-[150px]">Address</b> {details.holderAddress ?? "—"}
                    </div>
                    <div className="col-span-2">
                      <b className="inline-block w-[150px]">Business Name</b> {details.businessName ?? "—"}
                    </div>
                    {details.jointHolderName && (
                      <div className="col-span-2">
                        <b className="inline-block w-[150px]">Joint Holder</b> {details.jointHolderName}
                        {details.jointHolderRelation ? ` (${details.jointHolderRelation})` : ""}
                      </div>
                    )}
                    {details.presentOccupantName && (
                      <div className="col-span-2">
                        <b className="inline-block w-[150px]">Present Occupant</b> {details.presentOccupantName}
                        {details.presentOccupantAadhaar ? ` - Aadhaar: ${details.presentOccupantAadhaar}` : ""}
                        {details.presentOccupantYearsApprox ? ` (occupying for ${details.presentOccupantYearsApprox})` : ""}
                      </div>
                    )}
                  </div>

                  <h2 className="mt-5 border-b border-slate-300 pb-1 text-[13px] font-bold text-nnm-blue">Rent Details</h2>
                  <div className="mt-2 grid grid-cols-2 gap-x-8 gap-y-1">
                    <div>
                      <b className="inline-block w-[150px]">Monthly Rent</b> ₹{money(details.baseMonthlyRent)}
                    </div>
                    <div>
                      <b className="inline-block w-[150px]">Security Deposit</b> ₹{money(details.securityDeposit)}
                    </div>
                    <div>
                      <b className="inline-block w-[150px]">Escalation</b>{" "}
                      {Number(details.escalationPct) > 0 ? `${details.escalationPct}% every ${details.escalationIntervalYears} year(s)` : "None"}
                    </div>
                    <div>
                      <b className="inline-block w-[150px]">Agreement Start</b> {dateStr(details.agreementStartDate)}
                    </div>
                    <div>
                      <b className="inline-block w-[150px]">Rent Paid Till</b> {details.rentPaidTillMonth ?? "Never"}
                    </div>
                    <div>
                      <b className="inline-block w-[150px]">Status</b> {details.status}
                    </div>
                  </div>

                  <p className="mt-6 text-[10px] text-slate-500">
                    This is a computer generated summary of your municipal shop rental agreement with Munger Nagar
                    Nigam. For payment or agreement corrections, please visit the Nagar Nigam counter.
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>
      </main>
      <div className="no-print">
        <SiteFooter />
      </div>
    </div>
  );
}