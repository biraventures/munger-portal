import { AlertTriangle } from "lucide-react";

/** Shown in every "collect payment" confirmation: the person recording the payment answers for a wrong entry. */
export function PaymentResponsibilityWarning() {
  return (
    <div role="note" className="mb-4 flex items-start gap-2 rounded-md border-2 border-red-300 bg-red-50 p-3 text-xs leading-relaxed text-red-800">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <b>Warning:</b> confirming will record this payment in the system against the holding. You will be held responsible for any
        wrong entry made. Check the holding number, owner, amount and tax collector before you confirm.
        <div className="mt-1">
          चेतावनी: पुष्टि करने पर यह भुगतान सिस्टम में दर्ज हो जाएगा। गलत प्रविष्टि के लिए आप जिम्मेदार होंगे।
        </div>
      </div>
    </div>
  );
}
