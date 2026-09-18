/**
 * Ported directly from Code.gs (MUNGER NAGAR NIGAM — PROPERTY TAX COUNTER
 * RECEIPT SYSTEM). Keep these in lockstep with the source Apps Script
 * until it is fully decommissioned — any rate change made to the sheet
 * must be mirrored here too.
 */

export const TAX_RATE = 0.09; // 9% of ARV
// Receipt numbers auto-increment from this floor onwards - originally
// matched Code.gs's RECEIPT_START_NO (the next number after their last
// physical receipt, 40558, at the time of migration). Advanced to
// 40747 (Aug 2026) to catch up with further physical receipts issued
// since then. getNextReceiptNo() treats this as a floor, not just an
// empty-table fallback - it's always the minimum, so raising this
// value is always safe even if live usage has already passed it.
export const RECEIPT_START_NO = 40747;
// Independent numbering sequence from payment receipts — matches
// Code.gs's DEMAND_NOTICE_START_NO.
export const DEMAND_NOTICE_START_NO = 1;
export const PLINTH_AREA_REBATE_THRESHOLD = 250; // sqft — below this, 100% rebate
export const PLINTH_AREA_REBATE_PCT = 1.0;
export const RAIN_WATER_REBATE_PCT = 0.05;

// Per-sqft rate for VACANT land, by road type
export const VACANT_LAND_RATE: Record<string, number> = {
  PMR: 0.46,
  MR: 0.37,
  OR: 0.28,
};

// Occupancy multiplier
export const OCCUPANCY_MULTIPLIER: Record<string, number> = {
  self: 1.0,
  rented: 1.5,
};

export type RoadType = "PMR" | "MR" | "OR";
export type ConstType = "RCC" | "Asbestos" | "Other";
export type UseCategory = "C" | "R";

export const CONSTRUCTION_RATE: Record<ConstType, Record<RoadType, Record<UseCategory, number>>> = {
  RCC: { PMR: { C: 44, R: 17 }, MR: { C: 33, R: 11 }, OR: { C: 22, R: 6 } },
  Asbestos: { PMR: { C: 33, R: 11 }, MR: { C: 22, R: 9 }, OR: { C: 17, R: 4 } },
  Other: { PMR: { C: 17, R: 6 }, MR: { C: 11, R: 5 }, OR: { C: 11, R: 3 } },
};

export const USE_TYPE_MULTIPLIER: Record<string, { factor: number; category: UseCategory }> = {
  "Residential": { factor: 0.7, category: "R" },
  "Hotel, bar, club, healthclub, marriage hall": { factor: 2.4, category: "C" },
  "shops(less than 250 sq ft)": { factor: 0.8, category: "C" },
  "shops(250 sq ft and above), showroom, shopping mall, cinema, multiplex, dispensary, lab, restaurant, guest house": { factor: 1.2, category: "C" },
  "commercial office, financial institutions, banks, insurance office, pvt hospitaland nursing home": { factor: 2.4, category: "C" },
  "industry, workshop, storage, godown, warehouse": { factor: 1.6, category: "C" },
  "commercial est. , State and Central undertakings": { factor: 1.6, category: "C" },
  "Coaching classes, guidance and training centres and their hostels": { factor: 1.2, category: "C" },
  "state and central govt offices, other than commercial undertakings": { factor: 0.6, category: "C" },
  "pvt school, pvt college, pvt research institutes,other pvt institutes and their hostels": { factor: 1.2, category: "C" },
  "places, centres and institutions of spiritual and religious nature": { factor: 0.0, category: "C" },
  "Educational and social institutions run by charitable trusts on no- profit no- loss basis for benefit of poor, physically challenged, social security of women and children": { factor: 0.8, category: "C" },
  "any other": { factor: 1.2, category: "C" },
};

export const SOLID_WASTE_RATE: Record<string, number> = {
  "Residential House": 30,
  "BPL House/ Slum": 0,
  "Apartment/RWA": 1500,
  "Street Vendor": 50,
  "Shop": 100,
  "Restaurant/Rest house/Dharamshala/ Hotel": 500,
  "Pvt and government nursery": 500,
  "Star hotel/ equivalent hotel": 5000,
  "Commercial office, government office, insurance office, coaching, education instt": 500,
  "Clinic, Dispensary, Laboratory": 250,
  "Hospital (upto 50 beds)": 1500,
  "Hospital( above 50 beds)": 3000,
  "Religious places": 100,
  "SMEs generating 10 Kg waste per day": 500,
  "Godown , Cold storage": 1000,
  "Marriage hall, festival hall, exhibition, trade fair": 2500,
};
// Present (current actual on-ground) category of the holding — distinct
// from the floors' own usage_type used for tax calculation. Purely
// descriptive/informational, shown on notices and used for MIS
// reporting; does not feed into any tax formula.
export const PRESENT_CATEGORY_OPTIONS: string[] = [
  "School",
  "Coaching class / Tution",
  "Hospital",
  "Clinic/test lab",
  "Parking",
  "Park",
  "Public toilet",
  "Library",
  "Office",
  "Commercial Complex",
  "Mall",
  "Shop",
  "Petrol Pump",
  "House",
  "Religious Place",
  "Anganwadi",
  "Hotel",
  "Restaurant",
  "Vacant Land",
  "Warehouse/Godown/Cold storage",
  "Marriage hall/Convention center",
  "Old age home/orphanage/social welfare building",
  "Others",
];

export const EARLY_PAYMENT_REBATE_PCT = 0.05;
export const LATE_FEE_RATE_CHANGE_DATE = new Date(2013, 2, 31);
export const LATE_FEE_MONTHLY_PCT_BEFORE_2013 = 0.02;
export const LATE_FEE_MONTHLY_PCT_FROM_2013 = 0.015;

export const CONSTRUCTION_RATE_2011_2020: Record<ConstType, Record<RoadType, Record<UseCategory, number>>> = {
  RCC: { PMR: { C: 40, R: 15 }, MR: { C: 30, R: 10 }, OR: { C: 20, R: 5 } },
  Asbestos: { PMR: { C: 30, R: 10 }, MR: { C: 20, R: 8 }, OR: { C: 15, R: 3 } },
  Other: { PMR: { C: 15, R: 5 }, MR: { C: 10, R: 4 }, OR: { C: 10, R: 2 } },
};

export const NEW_HOLDING_NO_PREFIX = "MMC-";
export const NEW_HOLDING_NO_DIGITS = 7;
export const PARTIALLY_KNOWN_HOLDING_NO_PREFIX = "MUNGMC-";
export const PARTIALLY_KNOWN_HOLDING_NO_DIGITS = 6;

// For holdings bulk-imported from old paper/register records (known
// old ARV, no real floor survey) - a separate series from
// PARTIALLY_KNOWN above because, unlike that one-off operator-entry
// flow, these go through the full assign -> survey -> operator entry
// -> dual verification workflow and get REAL floor-wise details once
// surveyed, not a synthetic back-calculated area. See
// migratedHoldingSurvey.service.ts.
export const MIGRATED_HOLDING_NO_PREFIX = "MUNG-MIG-";
export const MIGRATED_HOLDING_NO_DIGITS = 5;

// Assigned once a migrated holding's survey is FINALLY approved
// (final Deputy Commissioner/City Manager sign-off) - replaces its
// MUNG-MIG- number. The MNN- prefix itself is the marker: any holding
// under it is one that started out unsurveyed (bulk-imported from an
// old paper record) and has now actually been surveyed and verified,
// distinct from both the "MMC-" (always properly surveyed from the
// start) and "MUNGMC-" (still only back-calculated, never a real
// survey) series.
export const FINALIZED_MIGRATED_HOLDING_NO_PREFIX = "MNN-";
export const FINALIZED_MIGRATED_HOLDING_NO_DIGITS = 6;

export const PARTIALLY_KNOWN_USAGE = "Residential";
export const PARTIALLY_KNOWN_OCCUPANCY = "self";
export const PARTIALLY_KNOWN_ROAD_TYPE_FOR_SOLVE: RoadType = "MR";
export const PARTIALLY_KNOWN_CONST_TYPE: ConstType = "Other";

export const AUTO_ARV_LIVE_PERIOD_LABEL = "2021-2022 to last year";
export const AUTO_ARV_PERIODS: Record<string, Record<ConstType, Record<RoadType, Record<UseCategory, number>>>> = {
  "2011-2012 to 2016-2017": CONSTRUCTION_RATE_2011_2020,
  "2017-2018 to 2020-2021": CONSTRUCTION_RATE_2011_2020,
  "2021-2022 to last year": CONSTRUCTION_RATE,
};

export const PERIOD_OF_ASSESSMENT_BUCKETS: Record<string, { start: number | null; end: number | "lastYear" }> = {
  "Before 1996-1997": { start: null, end: 1996 },
  "1997-1998 to 1999-2000": { start: 1997, end: 1999 },
  "2000-2001 to 2010-2011": { start: 2000, end: 2010 },
  "2011-2012 to 2016-2017": { start: 2011, end: 2016 },
  "2017-2018 to 2020-2021": { start: 2017, end: 2020 },
  "2021-2022 to last year": { start: 2021, end: "lastYear" },
};

export const PERIOD_TAX_RATES: Record<string, number> = {
  "Before 1996-1997": 0.45,
  "1997-1998 to 1999-2000": 0.375,
  "2000-2001 to 2010-2011": 0.375,
  "2011-2012 to 2016-2017": 0.09,
  "2017-2018 to 2020-2021": 0.09,
  "2021-2022 to last year": 0.09,
};