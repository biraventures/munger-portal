import type { Metadata } from "next";
import { PolicyPage, POLICY_ADDRESS, POLICY_EMAIL } from "@/components/policy-page";

export const metadata: Metadata = { title: "Refund & Cancellation Policy | Munger Nagar Nigam" };

export default function RefundPolicyPage() {
  return (
    <PolicyPage title="Refund & Cancellation Policy">
      <p>This policy applies to payments made online on this website to Municipal Corporation Munger. Refunds, where they are due under this policy, are completed within a 14-day refund period.</p>

      <h2>1. Payments are final once a receipt is issued</h2>
      <p>
        Property tax, shop rent and other municipal dues are statutory payments. Once a payment is successful and a receipt has been
        generated, it is credited to the holding or shop number entered and is not refundable merely because the payer changed their mind.
      </p>

      <h2>2. Payment debited but no receipt generated</h2>
      <ul>
        <li>If your account was debited but the payment shows failed or pending, please do not pay again immediately. The payment gateway normally confirms the final status within a few hours.</li>
        <li>If the transaction is confirmed as failed, the amount is returned to the original payment method within 14 days of the payment date.</li>
        <li>If the amount has not been returned within 14 days, write to us with the holding number, date, amount and transaction reference.</li>
      </ul>

      <h2>3. Duplicate or excess payment</h2>
      <p>
        If the same dues were paid twice, or more than the amount due was paid by mistake, the extra amount is refunded to the original payment
        method after the Nagar Nigam verifies it from its records. Where the holder prefers, the amount may instead be adjusted against
        future dues of the same holding.
      </p>

      <h2>4. Payment made against a wrong holding number</h2>
      <p>
        The payer is responsible for entering the correct holding or shop number, as stated in the declaration accepted before paying online.
        A payment made against a holding that is not in the payer&apos;s name is therefore not ordinarily refundable. If you entered a wrong
        number by mistake, tell us as soon as possible; the competent officer of the Nagar Nigam may review the case and decide whether it can
        be corrected, only with the receipt and the correct details.
      </p>

      <h2>5. Cancellation of a receipt or demand notice</h2>
      <p>
        A receipt or a demand notice can be cancelled only by the Nagar Nigam, through its internal approval process, when it was issued by
        mistake. Cancellation cannot be done by the payer on the website. If a receipt is cancelled and money is due back, it is refunded to the original payment method.
      </p>

      <h2>6. How refunds are paid</h2>
      <ul>
        <li>Refunds are always made to the same card, bank account or UPI ID used for the original payment. Cash refunds are not given for online payments.</li>
        <li>A refund approved by the Nagar Nigam is credited within the 14-day refund period.</li>
      </ul>

      <h2>7. How to request a refund or cancellation</h2>
      <p>
        Email <a className="text-nnm-blue underline" href={`mailto:${POLICY_EMAIL}`}>{POLICY_EMAIL}</a> or visit {POLICY_ADDRESS}, giving
        your holding or shop number, receipt number (if any), date and amount of payment, and the transaction reference from your bank or UPI app.
      </p>
    </PolicyPage>
  );
}
