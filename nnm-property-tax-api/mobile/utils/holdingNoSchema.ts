import { z } from "zod";

/**
 * Shared validator for holding numbers everywhere they're accepted as
 * input (route params, request bodies, query strings) - letters,
 * numbers, and a specific set of punctuation used in real holding
 * number formats (hyphen, slash, backslash, parentheses, square
 * brackets, comma, period). Spaces are still deliberately disallowed
 * - that's what originally caused duplicate holdings (e.g. "MUNG-
 * 08938" vs "MUNG-08938" being treated as different properties), and
 * remains the actual problem this validator exists to prevent.
 *
 * .trim() runs first so incidental leading/trailing whitespace from
 * copy-paste doesn't itself trigger the regex failure - only spaces
 * *within* the value are actually disallowed.
 */
export const holdingNoSchema = z
  .string()
  .trim()
  .min(1, "Holding number is required")
  .max(32)
  .regex(
    /^[A-Za-z0-9\-/\\()[\],.]+$/,
    "Holding number can only contain letters, numbers, and these characters: - / \\ ( ) [ ] , . - no spaces",
  );