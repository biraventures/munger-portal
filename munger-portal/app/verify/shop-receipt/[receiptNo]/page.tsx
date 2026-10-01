"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { VerificationLayout, VerificationField } from "@/components/verification-layout";
import { verifyShopReceipt } from "@/lib/verify-api";

function Content() {
  const params = useParams<{ receiptNo: string }>();
  const searchParams = useSearchParams();
  const sig = searchParams.get("sig") ?? "";

  const [data, setData] = useState<Awaited<ReturnType<typeof verifyShopReceipt>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sig) {
      setError("This verification link is missing its signature — use the link from the QR code exactly as scanned.");
      setLoading(false);
      return;
    }
    verifyShopReceipt(params.receiptNo, sig)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Verification failed."))
      .finally(() => setLoading(false));
  }, [params.receiptNo, sig]);

  return (
    <VerificationLayout loading={loading} error={error} title="Municipal Shop Rent Receipt">
      {data && (
        <>
          <VerificationField label="Receipt No" value={data.formattedReceiptNo} />
          <VerificationField label="Date" value={data.date} />
          <VerificationField label="Shop No" value={data.shopNo} />
          <VerificationField label="Market" value={data.marketName ?? "—"} />
          <VerificationField label="Location" value={data.location} />
          <VerificationField label="Holder Name" value={data.holderName} />
          <VerificationField label="Payment Mode" value={data.paymentMode} />
          {data.tvNumber && <VerificationField label="T.V. No." value={data.tvNumber} />}
          {data.tvDate && <VerificationField label="T.V. Date" value={data.tvDate} />}
          <VerificationField label="Amount Received" value={`₹${Number(data.amountReceived).toLocaleString("en-IN")}`} />
        </>
      )}
    </VerificationLayout>
  );
}

export default function VerifyShopReceiptPage() {
  return (
    <Suspense fallback={<div className="p-10 text-sm text-slate-400">Loading…</div>}>
      <Content />
    </Suspense>
  );
}