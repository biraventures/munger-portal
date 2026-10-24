/** Keys holding a personal ID number (Aadhaar, PAN) - masked for logins outside the Nagar Nigam (the Agency Operator). */
const ID_KEY = /aadhaar|aadhar|(^|_)pan(_number|No|Number)?$|panNumber|firm_pan/i;

function mask(v: unknown): unknown {
  if (typeof v !== "string" && typeof v !== "number") return v;
  const s = String(v).replace(/\s+/g, "");
  if (!s) return v;
  return `${"X".repeat(Math.max(0, s.length - 4))}${s.slice(-4)}`;
}

/** A copy of `data` with every Aadhaar / PAN value replaced by X's except its last 4 characters. */
export function maskIds<T>(data: T): T {
  if (Array.isArray(data)) return data.map((d) => maskIds(d)) as T;
  if (data && typeof data === "object" && !(data instanceof Date) && !Buffer.isBuffer(data)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) out[k] = ID_KEY.test(k) ? mask(v) : maskIds(v);
    return out as T;
  }
  return data;
}

export const isAgencyOperator = (admin: { role?: string } | undefined) => admin?.role === "agency_operator";
