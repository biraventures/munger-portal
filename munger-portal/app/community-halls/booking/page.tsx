"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { AlertCircle, Building2, Loader2, Printer } from "lucide-react";
import logoImg from "@/public/logo.png";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { dmy, fetchPublicBooking, payHallOnline, range, rupees, type PublicBooking } from "@/lib/community-hall-api";

const input = "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-nnm-blue focus:outline-none";
const STEPS = ["applied", "approved", "confirmed"] as const;

function StatusSteps({ b }: { b: PublicBooking }) {
  const closed = ["rejected", "cancelled", "expired"].includes(b.status);
  const at = STEPS.indexOf(b.status as (typeof STEPS)[number]);
  return closed ? (
    <p className="rounded-md bg-red-50 p-3 text-sm font-semibold text-red-700">{b.statusLabel}</p>
  ) : (
    <ol className="flex gap-2 text-xs">
      {["Applied", "Approved - pay", "Confirmed"].map((s, i) => (
        <li
          key={s}
          className={`flex-1 rounded-md px-2 py-1.5 text-center font-semibold ${i <= at ? "bg-green-600 text-white" : "bg-slate-100 text-slate-500"}`}
        >
          {s}
        </li>
      ))}
    </ol>
  );
}

function BookingStatus() {
  const params = useSearchParams();
  const [no, setNo] = useState(params.get("no") ?? "");
  const [phone, setPhone] = useState("");
  const [b, setB] = useState<PublicBooking | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const look = useCallback(async (auth: { sig?: string; phone?: string }, bookingNo: string) => {
    setBusy(true);
    setError(null);
    try {
      setB(await fetchPublicBooking(bookingNo, auth));
    } catch (e) {
      setB(null);
      setError(e instanceof Error ? e.message : "Could not find the booking.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const sig = params.get("sig");
    const n = params.get("no");
    if (sig && n) look({ sig }, n);
  }, [params, look]);

  async function pay() {
    if (!b) return;
    try {
      const r = await payHallOnline(b.bookingNo, b.applicantPhone);
      if (r.redirectUrl) window.location.href = r.redirectUrl;
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Online payment failed.");
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <div className="print:hidden">
        <SiteHeader />
      </div>
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-5 px-4 py-8">
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900 print:hidden">
          <Building2 className="h-6 w-6 text-nnm-blue" /> Community Hall Booking Status
        </h1>

        {!b && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              look({ phone }, no);
            }}
            className="space-y-3 rounded-xl border border-slate-200 bg-white p-5"
          >
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="b-no">
                Booking number
              </label>
              <input
                id="b-no"
                required
                value={no}
                onChange={(e) => setNo(e.target.value.toUpperCase())}
                placeholder="CH-…"
                className={input}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="b-phone">
                Mobile number given in the application
              </label>
              <input
                id="b-phone"
                required
                inputMode="numeric"
                maxLength={10}
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                className={input}
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-md bg-nnm-blue px-5 py-2 text-sm font-semibold text-white"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Show status
            </button>
          </form>
        )}

        {error && (
          <p role="alert" className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" /> {error}
          </p>
        )}

        {b && (
          <>
            <div className="print:hidden">
              <StatusSteps b={b} />
            </div>

            {b.status === "approved" && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 print:hidden">
                <p className="font-semibold">
                  Approved - pay {rupees(b.totalAmount)} by {b.paymentDueDate ? dmy(b.paymentDueDate) : "the due date"} to confirm the
                  booking.
                </p>
                <p className="mt-1">
                  Rent {rupees(b.rentAmount)} + refundable security deposit {rupees(b.depositAmount)}. If it is not paid by the due date,
                  the booking lapses and the dates are released.
                </p>
                {b.onlinePayment ? (
                  <button onClick={pay} className="mt-3 rounded-md bg-nnm-blue px-5 py-2 text-sm font-semibold text-white">
                    Pay online
                  </button>
                ) : (
                  <p className="mt-2 font-semibold">
                    Pay at the Munger Nagar Nigam office (cash, card / UPI on the POS, or demand draft), quoting booking number{" "}
                    {b.bookingNo}.
                  </p>
                )}
              </div>
            )}
            {(b.status === "rejected" || b.status === "cancelled") && (b.decisionRemarks || b.cancelReason) && (
              <p className="rounded-md bg-slate-100 p-3 text-sm text-slate-700 print:hidden">
                Reason: {b.status === "cancelled" ? b.cancelReason : b.decisionRemarks}
              </p>
            )}

            {/* printable-area: prints the booking (a confirmation once paid). */}
            <div className="printable-area rounded-xl border border-slate-200 bg-white p-6 text-sm text-black">
              <div className="mb-3 flex items-center gap-3 border-b-2 border-black pb-2">
                <Image src={logoImg} alt="" width={48} height={48} className="h-12 w-12" />
                <div>
                  <p className="text-base font-bold">MUNGER NAGAR NIGAM / मुंगेर नगर निगम</p>
                  <p className="font-semibold">
                    {b.status === "confirmed" ? "Community Hall Booking Confirmation" : "Community Hall Booking"}
                  </p>
                </div>
              </div>
              <table className="w-full">
                <tbody>
                  {(
                    [
                      [
                        "Booking No.",
                        <span key="n" className="font-mono">
                          {b.bookingNo}
                        </span>,
                      ],
                      ["Status", b.statusLabel],
                      ["Hall", `${b.hallName}${b.hallAddress ? `, ${b.hallAddress}` : ""}`],
                      ["Dates", `${range(b.fromDate, b.toDate)} (${b.days} day${b.days > 1 ? "s" : ""})`],
                      ["Applicant", b.applicantName],
                      ["Mobile", b.applicantPhone],
                      ["Address", b.applicantAddress],
                      ["Purpose", b.purpose],
                      ["Rent", `${rupees(b.rentAmount)} (${rupees(b.dailyRent)} per day)`],
                      ["Security deposit (refundable)", rupees(b.depositAmount)],
                      ["Total", rupees(b.totalAmount)],
                      ...(b.paidAt
                        ? [
                            [
                              "Paid",
                              `${new Date(b.paidAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} - ${b.paymentModeLabel}${b.paymentReference ? ` (${b.paymentReference})` : ""}`,
                            ],
                          ]
                        : []),
                      ...(b.depositStatus === "settled"
                        ? [
                            [
                              "Deposit",
                              `Refunded ${rupees(b.depositRefunded ?? 0)}${b.depositDeducted ? `, deducted ${rupees(b.depositDeducted)} - ${b.depositRemarks}` : ""}`,
                            ],
                          ]
                        : []),
                    ] as [string, React.ReactNode][]
                  ).map(([k, v]) => (
                    <tr key={k}>
                      <td className="w-56 py-1 pr-2 align-top text-slate-600">{k}</td>
                      <td className="py-1 font-medium">{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {b.status === "confirmed" && (
                <p className="mt-4 text-xs text-slate-600">
                  Show this confirmation at the hall. The security deposit is refunded after the function, less the cost of any damage.
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-2 print:hidden">
              <button
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
              >
                <Printer className="h-4 w-4" /> Print
              </button>
              <button
                onClick={() => {
                  setB(null);
                  setError(null);
                }}
                className="text-sm font-semibold text-nnm-blue underline"
              >
                Look up another booking
              </button>
            </div>
          </>
        )}
      </main>
      <div className="print:hidden">
        <SiteFooter />
      </div>
    </div>
  );
}

export default function BookingStatusPage() {
  return (
    <Suspense fallback={null}>
      <BookingStatus />
    </Suspense>
  );
}
