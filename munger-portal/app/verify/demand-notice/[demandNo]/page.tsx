"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { VerificationLayout, VerificationField } from "@/components/verification-layout";
import { Loader2 } from "lucide-react";
import { DeclarationCheckbox } from "@/components/online-declaration";
import { formatINR } from "@/lib/property-tax";
import { payDemandNoticeDues, verifyDemandNotice } from "@/lib/verify-api";

function Content() {
  const params = useParams<{ demandNo: string }>();
  const searchParams = useSearchParams();
  const sig = searchParams.get("sig") ?? "";

  const [data, setData] = useState<Awaited<ReturnType<typeof verifyDemandNotice>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [declared, setDeclared] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  async function handlePay() {
    setPaying(true);
    setPayError(null);
    try {
      const { redirectUrl } = await payDemandNoticeDues(params.demandNo, sig);
      window.location.href = redirectUrl;
    } catch (err) {
      setPayError(err instanceof Error ? err.message : "Could not start the payment. Please try again.");
      setPaying(false);
    }
  }

  useEffect(() => {
    if (!sig) {
      setError("This verification link is missing its signature — use the link from the QR code exactly as scanned.");
      setLoading(false);
      return;
    }
    verifyDemandNotice(params.demandNo, sig)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Verification failed."))
      .finally(() => setLoading(false));
  }, [params.demandNo, sig]);

  return (
    <VerificationLayout loading={loading} error={error} title="Property Tax Demand Notice">
      {data && (
        <>
          <VerificationField label="Demand Notice No" value={data.formattedDemandNo} />
          <VerificationField label="Date" value={data.date} />
          <VerificationField label="Holding No" value={data.holdingNo} />
          <VerificationField label="Owner Name" value={data.ownerName} />
          <VerificationField label="Address" value={data.address} />
          {data.assessmentYear && <VerificationField label="Assessment Year" value={data.assessmentYear} />}
          <VerificationField label="Total Amount Demanded" value={`₹${Number(data.totalAmountDemanded).toLocaleString("en-IN")}`} />
          <VerificationField label="Status" value={data.settled ? `Settled (Receipt ${data.settledReceiptNo})` : "Not yet settled"} />
          {data.payment && !data.settled && (
            <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
              {data.payment.available ? (
                <>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pending dues payable now</p>
                  <p className="mt-1 text-2xl font-semibold text-slate-900">{formatINR(data.payment.amountDue)}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {data.payment.servedBy
                      ? `This notice was served by Tax Collector ${data.payment.servedBy.name} (${data.payment.servedBy.code}); the payment will be credited under this code.`
                      : "This notice was collected from the Nagar Nigam office."}
                  </p>
                  <DeclarationCheckbox checked={declared} onChange={setDeclared} disabled={paying} />
                  <button
                    type="button"
                    onClick={handlePay}
                    disabled={paying || !declared}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-nnm-gold px-6 py-2.5 text-sm font-semibold text-[#20240a] shadow-[0_3px_0_#96791b] transition-transform hover:-translate-y-px disabled:opacity-60"
                  >
                    {paying && <Loader2 className="h-4 w-4 animate-spin" />}
                    {paying ? "Redirecting to bank…" : `Pay ${formatINR(data.payment.amountDue)}`}
                  </button>
                  {payError && <p role="alert" className="mt-2 text-xs text-red-600">{payError}</p>}
                </>
              ) : (
                data.payment.reason && <p className="text-sm text-slate-600">{data.payment.reason}</p>
              )}
            </div>
          )}
        </>
      )}
    </VerificationLayout>
  );
}

export default function VerifyDemandNoticePage() {
  return (
    <Suspense fallback={<div className="p-10 text-sm text-slate-400">Loading…</div>}>
      <Content />
    </Suspense>
  );
}