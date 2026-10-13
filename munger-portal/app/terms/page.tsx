import type { Metadata } from "next";
import { PolicyPage, POLICY_ADDRESS, POLICY_EMAIL, POLICY_ENTITY } from "@/components/policy-page";

export const metadata: Metadata = { title: "Terms & Conditions | Munger Nagar Nigam" };

export default function TermsPage() {
  return (
    <PolicyPage title="Terms & Conditions">
      <p>
        This website is operated by {POLICY_ENTITY} (&quot;Nagar Nigam&quot;, &quot;we&quot;). By using it, including paying any tax,
        fee or charge online, you agree to these terms.
      </p>

      <h2>1. Services</h2>
      <p>
        The website is used for the provision of municipal services, including water connections, street lights, building plan
        approvals and the receiving of public grievances, and for the digital collection of public dues (such as holding tax,
        shop rent and related charges), for transparent and efficient administration. Notices and documents published by the
        Nagar Nigam can also be viewed on it.
      </p>

      <h2>2. Accuracy of the details you give</h2>
      <ul>
        <li>You must enter the correct holding number, shop number or other reference for the payment you are making.</li>
        <li>A payment is credited to the holding or shop number you enter. Please check the owner name and amount shown before you pay.</li>
        <li>The amount shown is calculated from the Nagar Nigam&apos;s records on the date of payment. If you believe a record is wrong, please contact the Nagar Nigam office; paying does not stop you from asking for a correction.</li>
      </ul>

      <h2>3. Online payments</h2>
      <ul>
        <li>Payments are processed by an RBI-authorised payment gateway. Your card, net-banking or UPI details are entered on the secure payment page and are not stored by the Nagar Nigam.</li>
        <li>A receipt is generated only after the payment is confirmed as successful by the gateway. A message on your screen alone is not a receipt.</li>
        <li>Charges, rebates and late fees applicable under the Bihar Municipal Act, 2007 and the rules made under it, and the Nagar Nigam&apos;s orders apply to online payments in the same way as to counter payments.</li>
      </ul>

      <h2>4. Failed and duplicate payments</h2>
      <p>See the Refund &amp; Cancellation Policy for what happens when money is debited but no receipt is generated, or when a payment is made twice.</p>

      <h2>5. Acceptable use</h2>
      <ul>
        <li>Do not attempt to access records that are not yours, interfere with the website or use it for any unlawful purpose.</li>
        <li>Logins issued to staff, operators and agencies are for official use only and must not be shared.</li>
      </ul>

      <h2>6. Availability</h2>
      <p>We try to keep the website available at all times, but it may be unavailable for maintenance or because of faults outside our control. Payments can always be made at the Nagar Nigam office counter.</p>

      <h2>7. Content and liability</h2>
      <p>
        Documents and information on this website are provided for the convenience of citizens. The Nagar Nigam is not liable for any loss
        arising from delays or failures of banks, payment providers or internet services, or from incorrect details entered by the user.
      </p>

      <h2>8. Governing law</h2>
      <p>These terms are governed by the laws of India, including the Bihar Municipal Act, 2007 and the rules made under it. Any dispute is subject to the jurisdiction of the District Court, Munger.</p>

      <h2>9. Contact</h2>
      <p>Questions about these terms: {POLICY_ADDRESS}, or <a className="text-nnm-blue underline" href={`mailto:${POLICY_EMAIL}`}>{POLICY_EMAIL}</a>.</p>
    </PolicyPage>
  );
}
