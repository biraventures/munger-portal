"use client";

import { RecordChangeReview, type ReviewSection, type Val } from "./change-review";

type Rec = Record<string, unknown>;
type Baseline = { taken_at: string; shop: Rec | null; agreement: Rec | null } | null | undefined;

const sqft = (v: Val) => (v === null || v === undefined || v === "" ? "—" : `${Number(v).toLocaleString("en-IN", { maximumFractionDigits: 2 })} sq ft`);
const rs = (v: Val) => (v === null || v === undefined || v === "" ? "—" : `₹${Number(v).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`);
const date = (v: Val) => (v ? new Date(String(v)).toLocaleDateString("en-IN") : "—");

type Field = [label: string, column: string, proposalKey: string | null, format?: (v: Val) => string];

const SHOP_FIELDS: Field[] = [
  ["Shop no.", "shop_no", null],
  ["Market", "market_name", "marketName"],
  ["Shop no. in market", "market_shop_number", "marketShopNumber"],
  ["Location", "location", "location"],
  ["Ward", "ward", "ward"],
  ["Area", "area_sqft", "areaSqft", sqft],
  ["Total area", "total_area_sqft", "totalAreaSqft", sqft],
  ["Built-up area", "built_up_area_sqft", "builtUpAreaSqft", sqft],
  ["Status", "status", null],
];

const AGREEMENT_GROUPS: { title: string; fields: Field[] }[] = [
  {
    title: "Agreement holder",
    fields: [
      ["Agreement number", "agreement_number", "agreementNumber"],
      ["Name (as per agreement)", "agreement_holder_name", "agreementHolderName"],
      ["Name (as per demand register)", "demand_register_holder_name", "demandRegisterHolderName"],
      ["Applicable holder name", "holder_name", "holderName"],
      ["Relation name", "holder_relation_name", "holderRelationName"],
      ["Mobile no.", "holder_mobile", "holderMobile"],
      ["Address", "holder_address", "holderAddress"],
      ["ID proof number", "id_proof_number", "idProofNumber"],
      ["Business name", "business_name", "businessName"],
      ["Joint holder name", "joint_holder_name", "jointHolderName"],
      ["Joint holder relation", "joint_holder_relation", "jointHolderRelation"],
    ],
  },
  {
    title: "Rent",
    fields: [
      ["Rent (as per agreement)", "agreement_rent", "agreementRent", rs],
      ["Rent (as per demand register)", "demand_register_rent", "demandRegisterRent", rs],
      ["Applicable monthly rent", "base_monthly_rent", "baseMonthlyRent", rs],
      ["Rent (pre-2019-20)", "rent_pre_2019", "rentPre2019", rs],
      ["Rent (2019-20)", "rent_2019_20", "rent201920", rs],
      ["Rent (2020-21 onwards)", "rent_2020_21_onwards", "rent202021Onwards", rs],
      ["Misc. cost", "misc_cost", "miscCost", rs],
      ["Misc. cost reason", "misc_cost_reason", "miscCostReason"],
      ["Rebate", "misc_rebate", "miscRebate", rs],
      ["Rebate reason", "misc_rebate_reason", "miscRebateReason"],
    ],
  },
  {
    title: "Period and deposit",
    fields: [
      ["Agreement start", "agreement_start_date", "agreementStartDate", date],
      ["Agreement end", "agreement_end_date", "agreementEndDate", date],
      ["Security deposit", "security_deposit", "securityDeposit", rs],
    ],
  },
  {
    title: "Present occupant and notes",
    fields: [
      ["Present occupant", "present_occupant_name", "presentOccupantName"],
      ["Present occupant Aadhaar", "present_occupant_aadhaar", "presentOccupantAadhaar"],
      ["Present occupant - approx. years", "present_occupant_years_approx", "presentOccupantYearsApprox"],
      ["Notes", "notes", "notes"],
    ],
  },
];

function rows(fields: Field[], before: Rec | null, proposed: Rec | null) {
  return fields.map(([label, col, key, format]) => {
    const b = (before?.[col] ?? null) as Val;
    const a = key && proposed && proposed[key] !== undefined ? (proposed[key] as Val) : b;
    return { label, before: b, after: a, format };
  });
}

function pick(status: string, live: Rec | null, snap: Rec | null | undefined, baseline: Baseline) {
  const open = status === "pending" || status === "reverted";
  if (!open && baseline) return { rec: snap ?? null, note: `Compared with the record as it was when this request was made (${date(baseline.taken_at)}).` };
  if (!open) return { rec: live, note: "This request is older than the before-snapshots, so it is compared with the record as it is today - a change already applied may not show as changed." };
  return { rec: live, note: null };
}

/** Shop agreement change: the shop for context, and every agreement field with the proposed changes highlighted. */
export function ShopAgreementChangeReview({ status, shop, currentAgreement, baseline, proposed }: { status: string; shop: Rec | null; currentAgreement: Rec | null; baseline: Baseline; proposed: Rec }) {
  const s = pick(status, shop, baseline?.shop, baseline);
  const a = pick(status, currentAgreement, baseline?.agreement, baseline);
  const sections: ReviewSection[] = [
    { title: "Shop", rows: rows(SHOP_FIELDS, s.rec, null) },
    ...AGREEMENT_GROUPS.map((g) => ({ title: g.title, rows: rows(g.fields, a.rec, proposed) })),
  ];
  const note = !currentAgreement && !baseline?.agreement ? "New agreement - there is no agreement in force to compare with, so every entry is new." : a.note;
  return <RecordChangeReview title="Full shop and agreement details - changes highlighted" sections={sections} note={note} />;
}

/** Shop details edit: every shop field (the proposal carries only the edited ones), plus the agreement in force for context. */
export function ShopEditChangeReview({ status, shop, currentAgreement, baseline, proposed }: { status: string; shop: Rec | null; currentAgreement: Rec | null | undefined; baseline: Baseline; proposed: Rec }) {
  const s = pick(status, shop, baseline?.shop, baseline);
  const agreementFields: Field[] = [
    ["Holder", "holder_name", null],
    ["Mobile no.", "holder_mobile", null],
    ["Business", "business_name", null],
    ["Monthly rent", "base_monthly_rent", null, rs],
    ["Agreement period", "agreement_start_date", null, date],
  ];
  const sections: ReviewSection[] = [{ title: "Shop", rows: rows(SHOP_FIELDS, s.rec, proposed) }];
  if (currentAgreement) sections.push({ title: "Agreement in force (for reference - not changed by this request)", rows: rows(agreementFields, currentAgreement, null) });
  return <RecordChangeReview title="Full shop details - changes highlighted" sections={sections} note={s.note} />;
}
