import crypto from "crypto";
import { env } from "../config/env";

export type VerifiableDocType =
  | "receipt"
  | "demand-notice"
  | "shop-receipt"
  | "shop-demand"
  | "violation-notice"
  | "agreement";

/**
 * Signs (docType, docNo) into a short hex signature. Document/receipt
 * numbers in this system are plain sequential integers — without this,
 * a public "verify" endpoint keyed only on that number would let anyone
 * enumerate every citizen's payment/tax record by incrementing it in
 * the URL. The signature is what turns "I have this document" into the
 * only way to see its details; guessing a number without also guessing
 * a valid HMAC-SHA256 signature is computationally infeasible.
 *
 * Deliberately NOT signing the full document contents (amount, name,
 * etc.) — only the type + number. The verification page always reads
 * current data fresh from the database and displays that, so there's
 * nothing to keep in sync if a record's display fields are corrected
 * later; the signature only ever needs to prove "this specific
 * document number was legitimately issued by this system."
 */
export function signDocument(docType: VerifiableDocType, docNo: string): string {
  return crypto.createHmac("sha256", env.VERIFICATION_SECRET).update(`${docType}:${docNo}`).digest("hex").slice(0, 32);
}

export function verifyDocumentSignature(docType: VerifiableDocType, docNo: string, signature: string): boolean {
  const expected = signDocument(docType, docNo);
  // Constant-time comparison — a naive === here would let an attacker
  // learn the correct signature one byte at a time via response timing.
  const expectedBuf = Buffer.from(expected);
  const givenBuf = Buffer.from(signature);
  if (expectedBuf.length !== givenBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, givenBuf);
}

export function buildVerificationUrl(docType: VerifiableDocType, docNo: string): string {
  const sig = signDocument(docType, docNo);
  return `${env.FRONTEND_URL}/verify/${docType}/${encodeURIComponent(docNo)}?sig=${sig}`;
}