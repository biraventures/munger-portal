"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, XCircle, Loader2, AlertTriangle } from "lucide-react";
import { confirmOnlinePayment, type ConfirmPaymentResult } from "@/lib/online-payment";
import { ReceiptView } from "@/components/operator/receipt-view";

/**
 * ⚠ The `status` field name and its "success" values below are a
 * placeholder guess, not from ICICI's real spec (not available when this
 * was built). Whatever field ICICI's redirect actually uses to indicate
 * success/failure needs to replace the check in `looksSuccessful()` below
 * — and see the backend's confirmOnlinePayment() for why this client-side
 * signal isn't trustworthy on its own regardless.
 */
function looksSuccessful(params: Record<string, string>): boolean {
  const status = (params.status || params.txnStatus || params.transactionStatus || "").toLowerCase();
  return status === "success" || status === "s" || status === "00";
}

function PaymentReturnContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [state, setState] = useState<"confirming" | "done" | "error">("confirming");
  const [result, setResult] = useState<ConfirmPaymentResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [receiptView, setReceiptView] = useState<boolean>(false);

  useEffect(() => {
    const params: Record<string, string> = {};
    searchParams.forEach((value, key) => {
      params[key] = value;
    });

    const orderId = params.orderId || params.order_id;
    if (!orderId) {
      setError("No order reference was returned by the payment gateway. If money was deducted, contact your ward office with your holding number.");
      setState("error");
      return;
    }

    confirmOnlinePayment(orderId, looksSuccessful(params), params)
      .then((r) => {
        setResult(r);
        setState("done");
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Could not confirm the payment.");
        setState("error");
      });
  }, [searchParams]);

  if (state === "confirming") {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-nnm-blue" />
        <p className="text-sm text-ink-soft">Confirming your payment…</p>
      </div>
    );
  }

  if (state === "error" || !result) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-red-200 bg-red-50 p-8 text-center">
        <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-red-500" />
        <h1 className="mb-2 text-lg font-semibold text-red-800">Couldn&apos;t confirm this payment</h1>
        <p className="mb-5 text-sm text-red-700">{error}</p>
        <Link href="/property-tax" className="text-sm font-semibold text-nnm-blue hover:underline">
          Back to Property Tax Search
        </Link>
      </div>
    );
  }

  if (result.status === "success") {
    if (result.receipt && receiptView) {
      return (
        <ReceiptView
          receipt={result.receipt}
          onNewPayment={() => router.push("/property-tax")}
        />
      );
    }

    return (
      <div className="mx-auto max-w-lg rounded-xl border border-green-200 bg-green-50 p-8 text-center">
        <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-green-600" />
        <h1 className="mb-2 text-lg font-semibold text-green-800">Payment successful</h1>
        <p className="mb-1 text-sm text-green-700">
          ₹{Number(result.amount).toLocaleString("en-IN")} received for holding {result.holdingNo}
        </p>
        <p className="mb-5 text-sm text-green-700">Receipt No: <b>{result.receiptNo}</b></p>
        <div className="flex flex-col gap-4 justify-center items-center">
          <Link href="/property-tax" className="text-sm font-semibold text-nnm-blue hover:underline">
            Back to Property Tax Search
          </Link>
          <button
            className="border-2 rounded w-[40%] cursor-pointer font-bold"
            onClick={() => setReceiptView(true)}
          >
            View Receipt
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg rounded-xl border border-red-200 bg-red-50 p-8 text-center">
      <XCircle className="mx-auto mb-3 h-10 w-10 text-red-500" />
      <h1 className="mb-2 text-lg font-semibold text-red-800">Payment not successful</h1>
      <p className="mb-5 text-sm text-red-700">
        No charge was recorded for holding {result.holdingNo}. You can try again.
      </p>
      <Link href="/property-tax" className="text-sm font-semibold text-nnm-blue hover:underline">
        Back to Property Tax Search
      </Link>
    </div>
  );
}

export default function PaymentReturnPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Suspense fallback={<div className="py-16 text-center text-sm text-ink-soft">Loading…</div>}>
        <PaymentReturnContent />
      </Suspense>
    </div>
  );
}