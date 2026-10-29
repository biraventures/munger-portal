/** Aadhaar number check: 12 digits, not starting with 0 or 1, valid Verhoeff check digit (same rule as the API). */
const D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];
export function isValidAadhaar(n: string): boolean {
  if (!/^[2-9]\d{11}$/.test(n)) return false;
  let c = 0;
  n.split("")
    .reverse()
    .forEach((ch, i) => {
      c = D[c]![P[i % 8]![Number(ch)]!]!;
    });
  return c === 0;
}

export type HoldingDocumentKey = "gps" | "aadhaar" | "holdingPhoto" | "previousReceipt" | "landDocument" | "register";
export interface HoldingDocumentStatus {
  /** All that online payment needs is on file. */
  complete: boolean;
  onFile: Record<HoldingDocumentKey, boolean>;
  missing: string[];
  /** All that the Tax Collector needs before collecting (adds the offline demand register photo). */
  collectionComplete: boolean;
  missingForCollection: string[];
}
