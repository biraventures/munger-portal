import type { Metadata } from "next";
import { PolicyPage, POLICY_ADDRESS, POLICY_EMAIL, POLICY_ENTITY } from "@/components/policy-page";

export const metadata: Metadata = { title: "Privacy Policy | Munger Nagar Nigam" };

export default function PrivacyPage() {
  return (
    <PolicyPage title="Privacy Policy">
      <p>
        {POLICY_ENTITY} respects your privacy. This policy explains what information this website collects and how it is used.
      </p>

      <h2>1. Information we collect</h2>
      <ul>
        <li>Details needed to deliver a service: holding or shop number, owner name, address, mobile number, email address and, where required for a licence or agreement, identity and supporting documents.</li>
        <li>Payment details: the amount, date, mode and the transaction reference returned by the payment gateway. We do not see or store your card number, CVV, net-banking password or UPI PIN. These are entered only on the payment gateway&apos;s secure page.</li>
        <li>Technical information such as IP address, browser type and the pages visited, recorded in server logs for security and troubleshooting.</li>
      </ul>

      <h2>2. How we use it</h2>
      <ul>
        <li>To show your dues, accept payments, issue receipts and demand notices, and process applications.</li>
        <li>To contact you about your payment, application or a correction to your record.</li>
        <li>To keep the website secure, prevent misuse and meet audit and legal requirements.</li>
      </ul>

      <h2>3. Who we share it with</h2>
      <p>
        We do not sell or rent your information. It is shared only with the payment gateway and your bank to complete a payment, with
        government departments where the law requires, and with the Nagar Nigam&apos;s authorised officers and agencies working on its behalf, who are
        bound to use it only for municipal work.
      </p>

      <h2>4. Security</h2>
      <p>
        The website uses encrypted (HTTPS) connections. Staff access is by individual login with role-based permissions, and access to records is limited to what each role needs.
        No system is completely secure, but we take reasonable steps to protect your information.
      </p>

      <h2>5. How long we keep it</h2>
      <p>Tax, payment and licence records are kept for as long as required by law and municipal record-keeping rules, as they form part of the permanent account of the holding or shop.</p>

      <h2>6. Cookies</h2>
      <p>The website uses only the cookies and browser storage needed to keep you signed in and remember basic settings. It does not use advertising cookies.</p>

      <h2>7. Your choices</h2>
      <p>
        You may ask to see the details held about your holding or to have an error corrected, by writing to us or visiting the office.
        Some information cannot be removed because the law requires the Nagar Nigam to keep it.
      </p>

      <h2>8. Contact</h2>
      <p>Privacy questions or requests: {POLICY_ADDRESS}, or <a className="text-nnm-blue underline" href={`mailto:${POLICY_EMAIL}`}>{POLICY_EMAIL}</a>.</p>
    </PolicyPage>
  );
}
