"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, XCircle, Loader2, AlertTriangle } from "lucide-react";
import { confirmOnlinePayment, type ConfirmPaymentResult } from "@/lib/online-payment";
import { ReceiptView } from "@/components/operator/receipt-view";

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

    // The server asks the bank; while the bank has no final answer the order stays "pending", so check again
    // every 10 seconds for up to 3 minutes.
    let cancelled = false;
    let tries = 0;
    const check = () => {
      confirmOnlinePayment(orderId)
        .then((r) => {
          if (cancelled) return;
          setResult(r);
          setState("done");
          if (r.status === "pending" && ++tries < 18) timer = setTimeout(check, 10000);
        })
        .catch((err) => {
          if (cancelled) return;
          setError(err instanceof Error ? err.message : "Could not confirm the payment.");
          setState("error");
        });
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    check();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
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

  if (result.status === "pending" || result.status === "needs_review") {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-amber-200 bg-amber-50 p-8 text-center">
        {result.status === "pending" ? (
          <Loader2 className="mx-auto mb-3 h-10 w-10 animate-spin text-amber-600" />
        ) : (
          <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-amber-600" />
        )}
        <h1 className="mb-2 text-lg font-semibold text-amber-900">
          {result.status === "pending" ? "Waiting for the bank to confirm" : "Payment received - being processed by the office"}
        </h1>
        <p className="mb-2 text-sm text-amber-800">
          {result.status === "pending"
            ? "The bank has not yet confirmed this payment. This page checks again automatically. Please do not pay a second time."
            : "The bank has confirmed your payment, but it needs to be settled by the Holding Tax Section. Please do not pay again; contact the Municipal Corporation Office, Munger with this order reference if no receipt is issued."}
        </p>
        <p className="mb-5 text-sm text-amber-800">
          Holding {result.holdingNo} · Order reference <b>{result.order_id}</b>
        </p>
        <Link href="/property-tax" className="text-sm font-semibold text-nnm-blue hover:underline">
          Back to Property Tax Search
        </Link>
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