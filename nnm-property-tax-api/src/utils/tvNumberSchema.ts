import { z } from "zod";

/**
 * Shared validator for the Treasury Voucher (T.V.) number recorded
 * against a "District Treasury" payment (property tax and shop rent) -
 * a 15-40 character code that may mix letters, digits, and special
 * characters as printed on the treasury voucher, so this only bounds
 * the length and rejects whitespace/control characters that would
 * break display and search, rather than restricting which symbols are
 * allowed.
 *
 * .trim() runs first so incidental leading/trailing whitespace from
 * copy-paste doesn't itself trigger the length check.
 */
export const tvNumberSchema = z
  .string()
  .trim()
  .min(15, "T.V. number must be between 15 and 40 characters")
  .max(40, "T.V. number must be between 15 and 40 characters")
  .regex(/^\S+$/, "T.V. number cannot contain spaces or line breaks");
