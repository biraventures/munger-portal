import { parse } from "csv-parse/sync";
import { shopRepository, shopAgreementRepository } from "../repositories/shop.repository";
import { deriveMarketCode } from "../constants/marketCodes";

export interface ShopImportResult {
  shopsCreated: number;
  agreementsCreated: number;
  errors: { row: number; message: string }[];
}

/** Reads the first non-empty value across a few header spelling variants for the same column. */
function pick(row: Record<string, string>, candidates: string[]): string {
  for (const c of candidates) {
    const key = Object.keys(row).find((k) => k.trim().toLowerCase() === c.toLowerCase());
    if (key && row[key]?.trim()) return row[key]!.trim();
  }
  return "";
}

function toNumberOrNull(s: string): number | null {
  return s && /^-?\d+(\.\d+)?$/.test(s) ? parseFloat(s) : null;
}

const MONTH_NAMES: Record<string, string> = {
  january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
  july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
};

/**
 * Parses "March 2026" (the format actually used in the real stall
 * register) into "2026-03". Also accepts the already-correct "2026-03"
 * form directly, in case a future sheet uses that instead. Returns
 * null (not an error) for anything that doesn't match either shape -
 * an operator can fill this in manually later rather than the whole
 * row being rejected over one unparseable date.
 */
function parseMonthYear(raw: string): string | null {
  if (!raw) return null;
  const isoMatch = raw.match(/^(\d{4})-(\d{2})$/);
  if (isoMatch) return raw;

  const nameMatch = raw.trim().match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (nameMatch) {
    const monthNum = MONTH_NAMES[nameMatch[1]!.toLowerCase()];
    if (monthNum) return `${nameMatch[2]}-${monthNum}`;
  }
  return null;
}

/**
 * Parses "31.03.2026" (the format the real register uses for
 * Agreement Start/End Date) into "2026-03-31". Also accepts an
 * already-ISO "2026-03-31" directly. Returns null - not an error -
 * for anything that doesn't parse into a real calendar date, since
 * the real sheet has a handful of typos here (a 5-digit year, a
 * missing separator) that shouldn't fail the whole row's import over
 * one bad date; better to import everything else and leave that one
 * field blank for a human to fix.
 */
function parseDDMMYYYY(raw: string): string | null {
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const match = raw.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!match) return null;

  const day = parseInt(match[1]!, 10);
  const month = parseInt(match[2]!, 10);
  const year = parseInt(match[3]!, 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  // Confirms it's a real calendar date (rejects e.g. 30.02.2020) -
  // JS Date silently rolls invalid day/month combinations over into
  // the next month rather than erroring, so this is checked by
  // comparing the constructed date's own fields back against the input.
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Bulk import of shops, optionally with their current tenancy in the
 * same row. Two things changed from the original version of this
 * import based on the real stall register:
 *
 * 1. shop_no is DERIVED, not read from a column - it's the market's
 *    code (from constants/marketCodes.ts) plus the sheet's "Stall
 *    Serial Number within market" column, joined with a hyphen (e.g.
 *    market "Private Bus Stand" + serial "15" -> "PBSM-15"). The
 *    serial number itself isn't necessarily numeric (the real
 *    register has serials like "Test1" and "44A"), so this is a
 *    straightforward string join, not arithmetic. The serial is also
 *    stored on its own (market_shop_number, migration 046) - the
 *    "two shop numbers" this session discussed: one scoped to the
 *    market, one overall.
 *
 * 2. Occupied/vacant comes from an explicit "Status" column
 *    (Vacant/Occupied), not inferred from whether a holder name is
 *    present - the real register has no separate "Holder Name"
 *    column at all (only the Agreement/Demand Register reference
 *    columns below), so there was nothing reliable to infer from.
 *
 * A shop with no "Status" column value, or a value that isn't
 * recognizably "vacant", defaults to occupied - the same safe-default
 * reasoning as migration 044: a shop wrongly left vacant becomes
 * publicly visible as available to apply for, which is the worse
 * mistake to make silently.
 *
 * Holder Name and Base Monthly Rent are still deliberately NOT
 * applied directly to holder_name/base_monthly_rent even for an
 * occupied shop - there was no clarity on which of several
 * possibly-conflicting name/rent sources (Agreement vs. Demand
 * Register) should be treated as authoritative, and guessing wrong
 * would mean generating demand notices against the wrong tenant or
 * amount. Both raw values still "sit on the server" rather than being
 * lost - recorded in the agreement's notes as a pending-review line -
 * so whoever reviews the shop later has everything needed to make the
 * correction.
 *
 * Only ONE of the three period rent columns (Rent Pre-2019 / Rent
 * 2019-20 / Rent 2020-21[-Onwards]) needs to be filled in per row -
 * resolveRentPeriodsFromValues derives the other two automatically
 * per the confirmed escalation formula (25% at 2019-20, a further 50%
 * from 2020-21), so this import doesn't require all three; whichever
 * the sheet provides is stored, and the rest are computed at read
 * time, not here.
 */
export async function importShopsCsv(csvContent: string, actorDisplayName: string): Promise<ShopImportResult> {
  const records: Record<string, string>[] = parse(csvContent, { columns: true, skip_empty_lines: true, relax_column_count: true });

  const result: ShopImportResult = { shopsCreated: 0, agreementsCreated: 0, errors: [] };

  for (let i = 0; i < records.length; i++) {
    const row = records[i]!;
    const rowNum = i + 2;
    try {
      const marketName = pick(row, ["Market Name"]);
      if (!marketName) {
        result.errors.push({ row: rowNum, message: "Missing Market Name" });
        continue;
      }

      const marketShopNumber = pick(row, ["Stall Serial Number within market", "Stall Serial Number", "Market Shop Number", "Serial Number"]);
      if (!marketShopNumber) {
        result.errors.push({ row: rowNum, message: "Missing Stall Serial Number within market" });
        continue;
      }

      const shopNo = `${deriveMarketCode(marketName)}-${marketShopNumber}`;

      const existing = await shopRepository.findByShopNo(shopNo);
      if (existing) {
        result.errors.push({ row: rowNum, message: `Shop "${shopNo}" already exists - skipped` });
        continue;
      }

      const location = pick(row, ["Location"]) || marketName;

      const statusRaw = pick(row, ["Status"]).toLowerCase();
      const isVacant = statusRaw === "vacant";

      await shopRepository.upsert(
        shopNo,
        {
          marketName,
          marketShopNumber,
          location,
          ward: pick(row, ["Ward"]) || null,
          areaSqft: toNumberOrNull(pick(row, ["Area Sqft"])),
          totalAreaSqft: toNumberOrNull(pick(row, ["Total Area Sqft"])),
          builtUpAreaSqft: toNumberOrNull(pick(row, ["Built Up Area Sqft"])),
          status: isVacant ? "vacant" : "occupied",
        },
        actorDisplayName,
        true,
      );
      result.shopsCreated++;

      if (!isVacant) {
        const agreementHolderName = pick(row, ["Agreement Holder Name"]);
        const demandRegisterHolderName = pick(row, ["Demand Register Holder Name"]);
        const agreementRent = pick(row, ["Agreement Rent"]);
        const demandRegisterRent = pick(row, ["Demand Register Rent"]);

        const sheetNotes = pick(row, ["Comments", "Notes"]) || null;
        const nameParts = [agreementHolderName && `Agreement Holder Name: "${agreementHolderName}"`, demandRegisterHolderName && `Demand Register Holder Name: "${demandRegisterHolderName}"`].filter(Boolean);
        const rentParts = [agreementRent && `Agreement Rent: "${agreementRent}"`, demandRegisterRent && `Demand Register Rent: "${demandRegisterRent}"`].filter(Boolean);
        const pendingReviewNote =
          nameParts.length > 0 || rentParts.length > 0
            ? `[Pending review from bulk upload] ${[...nameParts, ...rentParts].join(", ")} - not yet applied to holder_name/base_monthly_rent, confirm the correct value before generating any demand for this shop.`
            : null;
        const notes = [sheetNotes, pendingReviewNote].filter(Boolean).join("\n\n") || null;

        await shopAgreementRepository.insertPartial(
          shopNo,
          {
            agreementNumber: pick(row, ["Agreement number", "Agreement Number"]) || null,
            agreementHolderName: agreementHolderName || null,
            demandRegisterHolderName: demandRegisterHolderName || null,
            holderName: null,
            holderRelationType: pick(row, ["Holder Relation Type"]) || null,
            holderRelationName: pick(row, ["Holder Relation Name"]) || null,
            holderMobile: pick(row, ["Holder Mobile"]) || null,
            holderAddress: pick(row, ["Holder Address"]) || null,
            idProofNumber: pick(row, ["ID Proof Number"]) || null,
            businessName: pick(row, ["Business Name"]) || null,
            agreementRent: toNumberOrNull(agreementRent),
            demandRegisterRent: toNumberOrNull(demandRegisterRent),
            baseMonthlyRent: null,
            rentPre2019: toNumberOrNull(pick(row, ["Rent Pre-2019", "Rent Pre 2019"])),
            rent201920: toNumberOrNull(pick(row, ["Rent 2019-20", "Rent 2019 20"])),
            rent202021Onwards: toNumberOrNull(pick(row, ["Rent 2020-21 Onwards", "Rent 2020 21 Onwards", "Rent 2020-21", "Rent 2020 21"])),
            agreementStartDate: parseDDMMYYYY(pick(row, ["Agreement Start Date"])),
            agreementEndDate: parseDDMMYYYY(pick(row, ["Agreement End Date"])),
            securityDeposit: toNumberOrNull(pick(row, ["Security Deposit"])) ?? 0,
            miscCost: toNumberOrNull(pick(row, ["Misc Cost"])) ?? 0,
            miscCostReason: pick(row, ["Misc Cost Reason"]) || null,
            miscRebate: toNumberOrNull(pick(row, ["Misc Rebate"])) ?? 0,
            miscRebateReason: pick(row, ["Misc Rebate Reason"]) || null,
            jointHolderName: pick(row, ["Joint Holder Name"]) || null,
            jointHolderRelation: pick(row, ["Joint Holder Relation"]) || null,
            jointHolderIdProofNumber: pick(row, ["Joint Holder ID Proof Number"]) || null,
            notes,
            rentPaidTillMonth: parseMonthYear(pick(row, ["Rent Paid Till Month (yyyy-mm)", "Rent Paid Till Month"])),
          },
          actorDisplayName,
        );
        result.agreementsCreated++;
      }
    } catch (err) {
      result.errors.push({ row: rowNum, message: err instanceof Error ? err.message : String(err) });
    }
  }

  return result;
}
