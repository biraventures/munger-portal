/**
 * Diagonal "CANCELLED" watermark across the whole printable area, plus
 * a prominent banner with the reason. Used on both receipt and demand
 * notice reprints - shown whenever the underlying record has been
 * cancelled (via the tax_daroga-approved cancellation workflow), so a
 * void document can never be mistaken for a valid one, whether viewed
 * on screen or printed.
 */
export function CancelledWatermark() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center overflow-hidden"
    >
      <span
        className="select-none whitespace-nowrap text-[110px] font-extrabold uppercase tracking-widest text-red-600 opacity-[0.14]"
        style={{ transform: "rotate(-30deg)" }}
      >
        CANCELLED
      </span>
    </div>
  );
}

/** Cheque / DD receipt not yet reconciled. */
export function isProvisional(reconcileStatus: string | undefined | null): boolean {
  return reconcileStatus === "pending" || reconcileStatus === "pm_verified";
}

export function ProvisionalWatermark() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center overflow-hidden">
      <span
        className="select-none whitespace-nowrap text-[72px] font-extrabold uppercase tracking-widest text-amber-600 opacity-[0.16]"
        style={{ transform: "rotate(-30deg)" }}
      >
        TEMPORARY / PROVISIONAL
      </span>
    </div>
  );
}

export function ProvisionalBanner({ paymentMode }: { paymentMode: string }) {
  return (
    <div className="relative z-20 my-3 rounded-md border-2 border-amber-500 bg-amber-50 p-2.5 text-center">
      <div className="text-[13px] font-extrabold uppercase tracking-wide text-amber-800">Temporary / Provisional Receipt</div>
      <div className="mt-0.5 text-[11px] text-amber-800">
        Paid by {paymentMode}. Valid only after the amount is credited to the Nagar Nigam account. If the {paymentMode.toLowerCase()} is
        dishonoured, this receipt stands cancelled and the demand becomes payable again.
      </div>
    </div>
  );
}

export function CancelledBanner({ reason }: { reason: string | null }) {
  return (
    <div className="relative z-20 my-3 rounded-md border-2 border-red-600 bg-red-50 p-3 text-center">
      <div className="text-[15px] font-extrabold uppercase tracking-wide text-red-700">⚠ This document has been cancelled</div>
      {reason && <div className="mt-0.5 text-[11px] text-red-700">Reason: {reason}</div>}
    </div>
  );
}

/**
 * Same prominent placement as CancelledBanner (right after the
 * header, "in front of" the rest of the details) but amber rather
 * than red - superseded is expected, routine lifecycle (a newer
 * reminder notice replaced this one), not a voided/cancelled
 * document, so it shouldn't read as equally alarming.
 */
export function SupersededBanner() {
  return (
    <div className="relative z-20 my-3 rounded-md border-2 border-amber-500 bg-amber-50 p-3 text-center">
      <div className="text-[15px] font-extrabold uppercase tracking-wide text-amber-800">⚠ This demand notice has been superseded</div>
      <div className="mt-0.5 text-[11px] text-amber-800">A later reminder notice replaced this one. It is no longer separately payable.</div>
    </div>
  );
}
