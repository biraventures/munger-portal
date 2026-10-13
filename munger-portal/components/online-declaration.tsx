/**
 * Declaration the public must tick before paying property tax online. When they pay, the receipt shows the
 * same text as a ticked declaration (with the time it was accepted). Counter / operator receipts do not carry it.
 */
export const ONLINE_PAYMENT_DECLARATION =
  "I/We understand that after payment of online holding tax, I/We must submit the duly filled in self-assessment form physically at Municipal Corporation office Munger and get the holding tax receipt duly signed and stamped by Municipal Corporation Munger for the tax amount paid by me. I/We am/are fully responsible in case I/We wrongly pay holding tax for a holding not in my name and I/We shall not reclaim the same.";

/** The tick box on the public payment page. */
export function DeclarationCheckbox({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="my-3 flex cursor-pointer items-start gap-2 text-left text-[11px] leading-snug text-ink">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-nnm-blue"
      />
      <span>{ONLINE_PAYMENT_DECLARATION}</span>
    </label>
  );
}

/** The ticked declaration printed on a receipt for an online payment. */
export function DeclarationAcceptedOnReceipt({ acceptedAt }: { acceptedAt: string }) {
  return (
    <div className="mt-2.5 rounded border border-slate-300 bg-slate-50 p-2.5 text-[9.5px] leading-snug text-slate-600">
      <div className="flex items-start gap-2">
        <span aria-hidden className="mt-px inline-flex h-3 w-3 shrink-0 items-center justify-center border border-slate-600 text-[10px] font-bold leading-none text-slate-800">
          ✓
        </span>
        <span>{ONLINE_PAYMENT_DECLARATION}</span>
      </div>
      <p className="mt-1 text-[9px] text-slate-500">Declaration ticked by the payer online on {acceptedAt}.</p>
    </div>
  );
}
