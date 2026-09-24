import { propertyRepository } from "../repositories/property.repository";
import { shopRepository } from "../repositories/shop.repository";
import { changeRequestRepository } from "../repositories/changeRequest.repository";
import { shopRentalApplicationRepository } from "../repositories/shopRentalApplication.repository";
import { tradeLicenseApplicationRepository } from "../repositories/tradeLicenseApplication.repository";
import { APPROVAL_STAGE_ORDER, ADMIN_ROLE_LABELS } from "../types/admin.types";

export interface DashboardSummary {
  holdings: { total: number };
  propertyChanges: {
    pending: number;
    byStage: { stage: string; label: string; count: number }[];
  };
  shops: { total: number };
  shopApplications: { received: number; pending: number };
  tradeLicense: { received: number; pending: number; issued: number };
}

/**
 * One aggregated read for the dashboard overview widget — reachable by
 * both operators and admins (see requireOperatorOrAdmin on the route),
 * since both dashboards show the same summary. Every count here comes
 * from a dedicated lightweight COUNT query, never a full row fetch —
 * see the "not a full row fetch" note on each repository method this
 * calls.
 */
export async function getDashboardSummary(): Promise<DashboardSummary> {
  const [holdingsTotal, shopsTotal, changeStageCounts, shopAppStats, tradeLicenseStats] = await Promise.all([
    propertyRepository.countAll(),
    shopRepository.countAll(),
    changeRequestRepository.countPendingByStage(),
    shopRentalApplicationRepository.getStats(),
    tradeLicenseApplicationRepository.getStats(),
  ]);

  // Always show all 4 property-mutation stages, in their fixed pipeline
  // order, even ones with zero pending — a stage silently missing from
  // the list reads as "nothing there" just as clearly as a zero would,
  // but only the zero is unambiguous about it having been checked.
  const byStage = APPROVAL_STAGE_ORDER.map((stage) => ({
    stage,
    label: ADMIN_ROLE_LABELS[stage],
    count: changeStageCounts[stage] ?? 0,
  }));
  const pendingTotal = byStage.reduce((sum, s) => sum + s.count, 0);

  return {
    holdings: { total: holdingsTotal },
    propertyChanges: { pending: pendingTotal, byStage },
    shops: { total: shopsTotal },
    shopApplications: shopAppStats,
    tradeLicense: {
      received: tradeLicenseStats.received,
      pending: tradeLicenseStats.pending,
      issued: tradeLicenseStats.approved,
    },
  };
}

const DEFAULT_PAGE_SIZE = 25;

function clampPage(page: unknown): number {
  const n = Number(page);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

function clampPageSize(pageSize: unknown): number {
  const n = Number(pageSize);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.floor(n), 100); // hard ceiling — the widget's own pager offers 25/50, this just guards against an arbitrary huge request
}

export async function listHoldingsForDashboard(page: unknown, pageSize: unknown, ward: unknown) {
  const p = clampPage(page);
  const ps = clampPageSize(pageSize);
  const wardFilter = typeof ward === "string" && ward.trim() !== "" ? ward.trim() : undefined;
  const { rows, total } = await propertyRepository.listPaginated(p, ps, wardFilter);
  return {
    items: rows.map((r) => ({
      holdingNo: r.holding_no,
      ownerName: r.owner_name,
      ward: r.ward,
      taxPaidTillYear: r.tax_paid_till_year,
      annualTaxAmount: r.tax_payable,
      solidWasteChargeAmount: r.solid_waste_charge,
    })),
    total,
    page: p,
    pageSize: ps,
  };
}

export async function listPropertyChangesForDashboard(page: unknown, pageSize: unknown) {
  const p = clampPage(page);
  const ps = clampPageSize(pageSize);
  const { rows, total } = await changeRequestRepository.listPendingPaginated(p, ps);
  return {
    items: rows.map((r) => ({
      id: r.id,
      holdingNo: r.holding_no,
      requestedBy: r.requested_by,
      requestedAt: r.requested_at,
      currentStage: r.current_stage,
      currentStageLabel: ADMIN_ROLE_LABELS[r.current_stage as keyof typeof ADMIN_ROLE_LABELS] ?? r.current_stage,
    })),
    total,
    page: p,
    pageSize: ps,
  };
}

export async function listShopsForDashboard(page: unknown, pageSize: unknown) {
  const p = clampPage(page);
  const ps = clampPageSize(pageSize);
  const { rows, total } = await shopRepository.listPaginated(p, ps);
  return {
    items: rows.map((r) => ({ shopNo: r.shop_no, marketName: r.market_name, location: r.location, status: r.status })),
    total,
    page: p,
    pageSize: ps,
  };
}

export async function listShopApplicationsForDashboard(page: unknown, pageSize: unknown) {
  const p = clampPage(page);
  const ps = clampPageSize(pageSize);
  const { rows, total } = await shopRentalApplicationRepository.listPaginated(p, ps);
  return {
    items: rows.map((r) => ({
      id: r.id,
      shopNo: r.shop_no,
      applicantName: r.applicant_name,
      requestedAt: r.requested_at,
      status: r.status,
    })),
    total,
    page: p,
    pageSize: ps,
  };
}

export async function listTradeLicenseApplicationsForDashboard(page: unknown, pageSize: unknown) {
  const p = clampPage(page);
  const ps = clampPageSize(pageSize);
  const { rows, total } = await tradeLicenseApplicationRepository.listPaginated(p, ps);
  return {
    items: rows.map((r) => ({
      id: r.id,
      applicationNumber: r.application_number,
      applicantName: r.applicant_name,
      entityName: r.entity_name,
      requestedAt: r.requested_at,
      status: r.status,
    })),
    total,
    page: p,
    pageSize: ps,
  };
}

export async function listTradeLicensesIssuedForDashboard(page: unknown, pageSize: unknown) {
  const p = clampPage(page);
  const ps = clampPageSize(pageSize);
  const { rows, total } = await tradeLicenseApplicationRepository.listPaginated(p, ps, "approved");
  return {
    items: rows.map((r) => ({
      id: r.id,
      applicationNumber: r.application_number,
      applicantName: r.applicant_name,
      entityName: r.entity_name,
      requestedAt: r.requested_at,
    })),
    total,
    page: p,
    pageSize: ps,
  };
}