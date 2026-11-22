"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Users,
  FileClock,
  FileWarning,
  LayoutGrid,
  ShoppingBag,
  Store,
  BarChart3,
  Award,
  Archive,
  Download,
  XCircle,
  ShieldCheck,
  Trash2,
  RefreshCw,
  Upload,
  MapPin,
  Map as MapIcon,
  ClipboardCheck,
  UserCheck,
  ClipboardList,
  Receipt,
  RotateCcw,
  AlertTriangle,
  List,
  Flag,
  Home,
  FileText,
  Printer,
  Landmark,
  FileSpreadsheet,
  CalendarDays,
  History,
  Trees,
  Flame,
  Building2,
} from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { MapSectionDashboard } from "@/components/building-permit/map-section-dashboard";
import { fetchBookings } from "@/lib/community-hall-api";
import { AgencyOperatorDashboard } from "@/components/agency/agency-operator-dashboard";
import { Pre2011ArvCard } from "@/components/admin/pre2011-arv-card";
import { DashboardGroup } from "@/components/admin/dashboard-group";
import { DashboardSummaryWidget } from "@/components/dashboard-summary-widget";
import { MutationPendingSummary } from "@/components/admin/mutation-pending-summary";
import { useAdminGuard } from "@/lib/use-admin-guard";
import {
  fetchChangeRequests,
  fetchDiscrepancyRequests,
  fetchSolidWasteRequestsToApprove,
  fetchDashboardSummaryAdmin,
  fetchDashboardHoldingsAdmin,
  fetchDashboardPropertyChangesAdmin,
  fetchDashboardShopsAdmin,
  fetchDashboardShopApplicationsAdmin,
  fetchDashboardTradeLicenseApplicationsAdmin,
  fetchDashboardTradeLicensesIssuedAdmin,
} from "@/lib/admin-api";
import { fetchShopAgreementRequests, fetchRentalApplications } from "@/lib/admin-shop-api";
import { fetchTradeLicenseApplications } from "@/lib/admin-trade-license-api";
import { ADMIN_ROLE_LABELS } from "@/lib/admin-auth";
import { fetchKycPending } from "@/lib/staff-kyc-api";
import { fetchSettlementPendingCount } from "@/lib/historical-payment-api";
import { fetchResolutionsWaiting } from "@/lib/holding-import-api";
import { fetchMigMyCount, setMigOperatorLogin } from "@/lib/mig-records-api";
import { fetchTlRemovalCount } from "@/lib/tl-notice-api";
import { fetchCollectionIssueCounts } from "@/lib/collection-issue-api";
import { fetchPendingCount as fetchNewHoldingPending, type PendingCount as NewHoldingPending } from "@/lib/new-holding-api";

export default function AdminDashboardPage() {
  const admin = useAdminGuard();
  const [myStagePendingCount, setMyStagePendingCount] = useState<number | null>(null);
  const [myDiscrepancyPendingCount, setMyDiscrepancyPendingCount] = useState<number | null>(null);
  const [solidWastePendingCount, setSolidWastePendingCount] = useState<number | null>(null);
  const [migPending, setMigPending] = useState<number | null>(null);
  const [tlRemovals, setTlRemovals] = useState<number | null>(null);
  const [ciCounts, setCiCounts] = useState<{ open: number; notice_issued: number; removals: number } | null>(null);
  const [hallApplications, setHallApplications] = useState<number | null>(null);
  const [myShopStagePendingCount, setMyShopStagePendingCount] = useState<number | null>(null);
  const [myRentalAppPendingCount, setMyRentalAppPendingCount] = useState<number | null>(null);
  const [myTradeLicensePendingCount, setMyTradeLicensePendingCount] = useState<number | null>(null);
  const [newHoldingPending, setNewHoldingPending] = useState<NewHoldingPending | null>(null);
  const [kycPending, setKycPending] = useState<number | null>(null);
  const [historicalPending, setHistoricalPending] = useState<number | null>(null);
  const [resolutionsWaiting, setResolutionsWaiting] = useState<number | null>(null);

  useEffect(() => {
    // The Agency Operator has its own small dashboard and none of these desks.
    if (!admin || ["agency_operator", "garden_counter", "crematorium_counter", "crematorium_prabhari", "community_hall_prabhari"].includes(admin.role)) return;
    fetchChangeRequests({ status: "pending", myStage: true })
      .then((r) => setMyStagePendingCount(r.requests.length))
      .catch(() => setMyStagePendingCount(null));
    fetchDiscrepancyRequests({ status: "pending", myStage: true })
      .then((r) => setMyDiscrepancyPendingCount(r.requests.length))
      .catch(() => setMyDiscrepancyPendingCount(null));
    // Solid waste user types waiting with this Tax Daroga / City Manager.
    // Community hall applications waiting for the Commissioner's approval.
    if (admin.role === "commissioner") {
      fetchBookings({ status: "applied" })
        .then((r) => setHallApplications(r.counts.applied))
        .catch(() => setHallApplications(null));
    }
    if (["tax_daroga", "city_manager", "commissioner", "deputy_commissioner"].includes(admin.role)) {
      fetchCollectionIssueCounts()
        .then(setCiCounts)
        .catch(() => setCiCounts(null));
    }
    if (admin.role === "deputy_commissioner") {
      fetchTlRemovalCount()
        .then(setTlRemovals)
        .catch(() => setTlRemovals(null));
    }
    if (["tax_daroga", "city_manager", "commissioner", "deputy_commissioner"].includes(admin.role)) {
      setMigOperatorLogin(false);
      fetchMigMyCount()
        .then((r) => setMigPending(r.pending))
        .catch(() => setMigPending(null));
    }
    if (admin.role === "tax_daroga" || admin.role === "city_manager") {
      fetchSolidWasteRequestsToApprove()
        .then((r) => setSolidWastePendingCount(r.length))
        .catch(() => setSolidWastePendingCount(null));
    }
    fetchShopAgreementRequests({ status: "pending", myStage: true })
      .then((r) => setMyShopStagePendingCount(r.requests.length))
      .catch(() => setMyShopStagePendingCount(null));
    fetchRentalApplications({ status: "pending", myStage: true })
      .then((r) => setMyRentalAppPendingCount(r.applications.length))
      .catch(() => setMyRentalAppPendingCount(null));
    fetchTradeLicenseApplications({ status: "pending", myStage: true })
      .then((r) => setMyTradeLicensePendingCount(r.applications.length))
      .catch(() => setMyTradeLicensePendingCount(null));
    if (["tax_daroga", "city_manager", "deputy_commissioner", "commissioner"].includes(admin.role)) {
      fetchResolutionsWaiting()
        .then((w) => setResolutionsWaiting(w.total))
        .catch(() => setResolutionsWaiting(null));
    }
    if (admin.role === "city_manager") {
      fetchSettlementPendingCount()
        .then(setHistoricalPending)
        .catch(() => setHistoricalPending(null));
    }
    if (["tax_daroga", "city_manager", "deputy_commissioner"].includes(admin.role)) {
      fetchKycPending()
        .then(setKycPending)
        .catch(() => setKycPending(null));
    }
    if (["tax_daroga", "tax_surveyor", "mutation_nodal_clerk", "deputy_commissioner", "commissioner", "city_manager"].includes(admin.role)) {
      fetchNewHoldingPending()
        .then(setNewHoldingPending)
        .catch(() => setNewHoldingPending(null));
    }
  }, [admin]);

  if (!admin) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  // The private agency's counter login: only its own cards (see components/agency/agency-operator-dashboard.tsx).
  if (admin.role === "agency_operator") return <AgencyOperatorDashboard admin={admin} />;
  // Garden Counter: the ticket counter is its only screen.
  if (admin.role === "garden_counter") return <GardenCounterRedirect />;
  // Crematorium and community hall staff: their own screen is all they use.
  if (admin.role === "crematorium_counter") return <OpenScreen href="/admin/crematorium-counter" label="the crematorium counter" />;
  if (admin.role === "crematorium_prabhari") return <OpenScreen href="/admin/crematorium" label="the crematorium" />;
  if (admin.role === "community_hall_prabhari") return <OpenScreen href="/admin/community-halls" label="the community hall bookings" />;
  // Map Section Nodal Clerk: building plan permits only.
  if (admin.role === "map_section_nodal_clerk") return <MapSectionDashboard admin={admin} />;

  // Stall Prabhari is scoped to the shop/rental workflow only; Trade
  // License Nodal is scoped to trade licenses only - each should see
  // just their own area of the dashboard, not the general
  // property-tax tooling or each other's area.
  const isStallPrabhari = admin.role === "stall_prabhari";
  const isTradeLicenseNodal = admin.role === "trade_license_nodal";
  const isAtps = admin.role === "assistant_town_planning_supervisor";
  const isAssistantArchitect = admin.role === "assistant_architect";
  // ATPS and Assistant Architect are GIS-only roles - restricted from
  // every group (property/shop/trade license) the same way, not just
  // a few cards within each, unlike Stall Prabhari/Trade License
  // Nodal who still see some cards in their own area.
  const isGisOnlyRole = isAtps || isAssistantArchitect;
  const isAgencyRole = admin.role === "agency_team_leader" || admin.role === "agency_project_manager";
  const isRestrictedRole = isStallPrabhari || isTradeLicenseNodal || isGisOnlyRole || admin.role === "je_mechanical" || admin.role === "ae_mechanical" || admin.role === "establishment_clerk" || admin.role === "abhilekh_prabhari" || admin.role === "tax_surveyor" || admin.role === "tax_collector" || isAgencyRole;
  // Roles whose whole job is one narrow task (streetlight mechanical
  // engineers, the Establishment Clerk, the Tax Surveyor, the Tax
  // Collector) - shouldn't see property/shop/trade-license sections
  // at all, unlike the broader isRestrictedRole exclusions above
  // (which still let e.g. Stall Prabhari see the shop section
  // they're actually part of the approval chain for). Tax Surveyor
  // and Tax Collector still see their own dedicated cards below -
  // those are gated on the role directly, not on this exclusion.
  const isNarrowlyScopedRole = admin.role === "je_mechanical" || admin.role === "ae_mechanical" || admin.role === "establishment_clerk" || admin.role === "abhilekh_prabhari" || admin.role === "tax_surveyor" || admin.role === "tax_collector" || isAgencyRole;
  const canApproveShopPublication = admin.role === "stall_prabhari" || admin.role === "city_manager" || admin.role === "deputy_commissioner";
  const canApproveDemandActions = admin.role === "stall_prabhari" || admin.role === "city_manager";
  const isCommissioner = admin.role === "commissioner";

  // Pre-computed per-card visibility so each grouped section's heading
  // can be hidden entirely when none of its cards apply to this role,
  // rather than showing an empty section.
  const isMutationChainRole = admin.role === "tax_daroga" || admin.role === "mutation_nodal_clerk" || admin.role === "deputy_commissioner" || isCommissioner;
  // The Tax Surveyor gives the field report on mutations assigned to him (migration 140); the City Manager approves
  // changes of use (Tax Daroga -> City Manager -> Deputy Commissioner).
  const showMutationApprovals = isMutationChainRole || admin.role === "tax_surveyor" || admin.role === "city_manager";
  const showCancellationRequests = !isRestrictedRole;
  const showBulkDemandNotices = !isRestrictedRole;
  const showAllPropertyChanges = isCommissioner;
  const showRenumberHolding = isCommissioner;
  const showHoldingImportReview = ["tax_daroga", "city_manager", "deputy_commissioner", "commissioner"].includes(admin.role);
  const showMigratedHoldingsAssign = admin.role === "deputy_commissioner" || admin.role === "city_manager";
  const showMigratedHoldingsSurveyor = admin.role === "tax_daroga";
  const showMigratedHoldingsMySurveys = admin.role === "tax_surveyor";
  const showInitiateSurvey = admin.role === "tax_surveyor";
  const showTaxCollectorPage = admin.role === "tax_collector";
  const showReportPropertyDiscrepancy = admin.role === "tax_collector";
  const showMyDiscrepancyReports = admin.role === "tax_collector";
  const showAgencyReports = ["agency_project_manager", "commissioner", "deputy_commissioner", "city_manager", "tax_daroga", "tax_collector"].includes(admin.role);
  const showAgencyNotices = admin.role === "agency_team_leader";
  const showDuesReport = ["agency_team_leader", "agency_project_manager", "tax_daroga", "city_manager", "deputy_commissioner", "commissioner"].includes(admin.role);
  const showBulkReceipts = ["tax_daroga", "commissioner", "deputy_commissioner", "city_manager"].includes(admin.role);
  const showInstrumentReconciliation = ["agency_project_manager", "tax_daroga", "commissioner", "deputy_commissioner", "city_manager"].includes(admin.role);
  const showUnsurveyedHouseEntry = admin.role === "tax_collector";
  // Old Records (MIG) approvals: Tax Daroga / City Manager act at their step (red when records wait), Commissioner / DMC see all.
  const showMigApprovals = ["tax_daroga", "city_manager", "commissioner", "deputy_commissioner"].includes(admin.role);
  const migDesk = admin.role === "tax_daroga" || admin.role === "city_manager";
  // Old Records (MIG): field staff add details; City Manager and DMC view.
  const showOldRecords = ["tax_collector", "tax_surveyor", "tax_daroga", "commissioner", "city_manager", "deputy_commissioner"].includes(admin.role);
  const showNoticeReceivingUpload = admin.role === "tax_collector";
  const showUnsurveyedHouses = ["tax_collector", "tax_daroga", "city_manager", "deputy_commissioner", "commissioner"].includes(admin.role);
  const showNoticeReceivingCopies = showUnsurveyedHouses;
  const DISCREPANCY_CHAIN_ROLES = ["tax_surveyor", "tax_daroga", "city_manager", "deputy_commissioner", "commissioner"];
  const showPropertyDiscrepancyRequests = DISCREPANCY_CHAIN_ROLES.includes(admin.role);
  const showResurveyFlags = admin.role === "tax_daroga" || admin.role === "commissioner";
  const showSolidWasteApprovals = admin.role === "tax_daroga" || admin.role === "city_manager";
  // Collection staff identity documents (KYC): Tax Daroga uploads, City Manager + DMC review, Commissioner views, staff see own.
  const isKycStaff = ["tax_collector", "agency_team_leader", "agency_project_manager"].includes(admin.role);
  const showStaffKyc = isKycStaff || ["tax_daroga", "city_manager", "deputy_commissioner", "commissioner"].includes(admin.role);
  // Old part payments on old holdings, settled year by year (Tax Daroga enters, City Manager approves).
  const showHistoricalPayments = ["tax_daroga", "city_manager", "deputy_commissioner", "commissioner"].includes(admin.role);
  const showSurveyorAssignments = ["tax_daroga", "city_manager", "deputy_commissioner", "commissioner"].includes(admin.role);
  const showCollectionIssues = ["tax_daroga", "commissioner", "city_manager", "deputy_commissioner"].includes(admin.role);
  // Red: open issues waiting for the City Manager's notice; receiving-copy removals waiting for the DMC.
  const ciDesk = admin.role === "city_manager" ? (ciCounts?.open ?? null) : admin.role === "deputy_commissioner" ? (ciCounts?.removals ?? null) : null;
  const showTaxCollectorAssignments = isCommissioner;
  const showDisputedHoldings = admin.role === "tax_daroga" || admin.role === "city_manager" || admin.role === "commissioner";
  const showRevertAuditTrail = isCommissioner;
  const showPublicDocuments = isCommissioner;
  const showManageLogins = isCommissioner;
  const showEmployeeDatabaseEntry = admin.role === "establishment_clerk";
  const showEmployeeDatabaseList = admin.role === "establishment_clerk";
  const showEmployeeDatabaseVerify = admin.role === "city_manager";
  const showEmployeeDatabaseProgress = isCommissioner;
  const showMutationApplications = isMutationChainRole || admin.role === "city_manager";
  const showNewHoldingRequests = showMutationApplications || admin.role === "tax_surveyor";
  const actsOnNewHolding = ["tax_daroga", "tax_surveyor", "deputy_commissioner", "commissioner"].includes(admin.role);
  const newHoldingWaiting = newHoldingPending ? newHoldingPending.mine : null;
  const showKhatianUpload = admin.role === "abhilekh_prabhari";
  const showKhatianReview = ["deputy_commissioner", "commissioner", "city_manager"].includes(admin.role);
  const showTlSurvey = admin.role === "tax_collector";
  const showTlNotices = ["tax_collector", "city_manager", "deputy_commissioner", "commissioner", "trade_license_nodal"].includes(admin.role);
  const isStreetlightReporterRole =
    admin.role === "tax_daroga" || admin.role === "tax_surveyor" || admin.role === "tax_collector" || admin.role === "stall_prabhari" ||
    admin.role === "commissioner" || admin.role === "deputy_commissioner" || admin.role === "city_manager";
  const showStreetlightReports =
    admin.role === "commissioner" || admin.role === "deputy_commissioner" || admin.role === "city_manager";
  const showPropertyWiseReport = ["commissioner", "deputy_commissioner", "city_manager", "tax_daroga"].includes(admin.role);
  // The agency Team Leader / Project Manager see these two in their own card group.
  const showAgencyPropertyReports = isAgencyRole;
  const showCollectedHoldings = ["agency_team_leader", "agency_project_manager", "tax_daroga", "city_manager", "deputy_commissioner", "commissioner"].includes(admin.role);
  const propertyGroupVisible =
    showMutationApprovals || showCancellationRequests || showBulkDemandNotices || showAllPropertyChanges || showRenumberHolding ||
    showMigratedHoldingsAssign || showMigratedHoldingsSurveyor || showMigratedHoldingsMySurveys || showInitiateSurvey || showTaxCollectorPage ||
    showAgencyReports || showAgencyNotices || showReportPropertyDiscrepancy || showMyDiscrepancyReports || showUnsurveyedHouseEntry || showNoticeReceivingUpload || showUnsurveyedHouses || showNoticeReceivingCopies || showPropertyDiscrepancyRequests || showResurveyFlags || showCollectionIssues || showSolidWasteApprovals || showTaxCollectorAssignments || showRevertAuditTrail ||
    showPropertyWiseReport || showDisputedHoldings || showHoldingImportReview || showBulkReceipts || showInstrumentReconciliation ||
    showAgencyPropertyReports || showCollectedHoldings || showDuesReport || showSurveyorAssignments || showStaffKyc || showHistoricalPayments;

  const showShopAgreementApprovals = !isTradeLicenseNodal && !isGisOnlyRole && !isNarrowlyScopedRole;
  const showShopRentalApplications = !isTradeLicenseNodal && !isGisOnlyRole && !isNarrowlyScopedRole;
  const showShopRentalPreferences = !isTradeLicenseNodal && !isGisOnlyRole && !isNarrowlyScopedRole;
  const showShopRateReport = !isTradeLicenseNodal && !isGisOnlyRole && !isNarrowlyScopedRole;
  const showShopsPendingPublication = canApproveShopPublication;
  const showShopEditApprovals = canApproveShopPublication;
  const showShopAgreementDocumentRequests = canApproveShopPublication;
  const showDemandReceiptActions = canApproveDemandActions;
  const showBulkUploadShops = isCommissioner;
  const showManageShops = isCommissioner;
  const showShopInspection = admin.role === "city_manager" || admin.role === "deputy_commissioner";
  const showShopWiseReport = admin.role === "commissioner" || admin.role === "city_manager";
  const showShopFlags = isStallPrabhari;
  const shopGroupVisible =
    showShopAgreementApprovals ||
    showShopRentalApplications ||
    showShopRentalPreferences ||
    showShopRateReport ||
    showShopsPendingPublication ||
    showShopEditApprovals ||
    showDemandReceiptActions ||
    showShopInspection ||
    showShopWiseReport ||
    showShopFlags ||
    showShopAgreementDocumentRequests ||
    showBulkUploadShops ||
    showManageShops;

  const showTradeLicenseApplications = !isStallPrabhari && !isGisOnlyRole && !isNarrowlyScopedRole;
  const showTradeLicenseReporting = !isStallPrabhari && !isGisOnlyRole && !isNarrowlyScopedRole;
  const tradeLicenseGroupVisible = showTradeLicenseApplications || showTradeLicenseReporting;

  const showOperators = !isRestrictedRole;
  const showDocumentArchive = !isRestrictedRole;
  const showAttendanceReport = isCommissioner;
  const showAssignCoordinates = isAtps || isCommissioner;
  const showGisMap = isAtps || isAssistantArchitect || isCommissioner;
  // Building plan permits: the Map Section Nodal Clerk works them (own dashboard); these roles can view them.
  const showBuildingMapApproval = isAssistantArchitect || isAtps || isCommissioner || admin.role === "deputy_commissioner" || admin.role === "city_manager";
  // Who's Who: City Manager verifies, Deputy Commissioner (DMC) publishes, Commissioner views.
  const showWhosWho = admin.role === "city_manager" || admin.role === "deputy_commissioner" || isCommissioner;
  const showGardens = ["commissioner", "deputy_commissioner", "city_manager"].includes(admin.role);
  const miscGroupVisible = showGardens || showPublicDocuments || showRevertAuditTrail || showOperators || showManageLogins || showDocumentArchive || showAttendanceReport || showAssignCoordinates || showGisMap || showBuildingMapApproval || showWhosWho;
  const employeeDatabaseGroupVisible = showEmployeeDatabaseEntry || showEmployeeDatabaseList || showEmployeeDatabaseVerify || showEmployeeDatabaseProgress;
  const streetlightGroupVisible = isStreetlightReporterRole;

  const groupHeadingClass = "mb-4 mt-10 text-lg font-semibold text-slate-800 first:mt-0";
  const cardClass = "flex flex-col rounded-xl border border-slate-200 bg-white p-6 transition-shadow hover:shadow-md";
  const iconWrapClass = "mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-nnm-blue";
  // A request waiting at this admin's own desk is easy to miss among a
  // full grid of cards - turning the card red (not just its count) is
  // the explicit reminder, for exactly the handful of cards below that
  // report a "waiting on your desk" count.
  const pendingCardClass = "flex flex-col rounded-xl border-2 border-red-300 bg-red-50 p-6 transition-shadow hover:shadow-md";
  const pendingIconWrapClass = "mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600";
  function deskCardClass(pendingCount: number | null): string {
    return pendingCount && pendingCount > 0 ? pendingCardClass : cardClass;
  }
  function deskIconWrapClass(pendingCount: number | null): string {
    return pendingCount && pendingCount > 0 ? pendingIconWrapClass : iconWrapClass;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />

      <main className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="mb-1 text-2xl font-semibold text-slate-900">Welcome, {admin.displayName}</h1>
        <p className="mb-8 text-sm text-slate-500">Signed in as {ADMIN_ROLE_LABELS[admin.role]}.</p>

        {(isMutationChainRole || admin.role === "city_manager") && <MutationPendingSummary highlight={admin.role} />}

        {!isAgencyRole && admin.role !== "abhilekh_prabhari" && (
          <DashboardSummaryWidget
            fetchSummary={fetchDashboardSummaryAdmin}
            fetchHoldings={fetchDashboardHoldingsAdmin}
            fetchPropertyChanges={fetchDashboardPropertyChangesAdmin}
            fetchShops={fetchDashboardShopsAdmin}
            fetchShopApplications={fetchDashboardShopApplicationsAdmin}
            fetchTradeLicenseApplications={fetchDashboardTradeLicenseApplicationsAdmin}
            fetchTradeLicensesIssued={fetchDashboardTradeLicensesIssuedAdmin}
            visibleTabs={isStallPrabhari ? ["shops", "shopApplications"] : isTradeLicenseNodal ? ["tradeLicenseApplications", "tradeLicensesIssued"] : undefined}
          />
        )}

        {(showKhatianUpload || showKhatianReview) && (
          <>
            <h2 className={groupHeadingClass}>Land Records (Khatian)</h2>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {showKhatianUpload && (
                <Link href="/admin/khatian-upload" className={cardClass}>
                  <span className={iconWrapClass}>
                    <FileText className="h-6 w-6" strokeWidth={1.8} />
                  </span>
                  <h3 className="mb-1.5 text-base font-semibold text-slate-900">Khatian Upload</h3>
                  <p className="text-sm text-slate-500">Upload scanned khatian PDFs by ward, survey sheet and part, and see the DMC&apos;s review.</p>
                </Link>
              )}
              {(showKhatianReview || showKhatianUpload) && (
                <Link href="/admin/khatian-review" className={cardClass}>
                  <span className={iconWrapClass}>
                    <FileText className="h-6 w-6" strokeWidth={1.8} />
                  </span>
                  <h3 className="mb-1.5 text-base font-semibold text-slate-900">{admin.role === "deputy_commissioner" ? "Khatian Review" : "Khatian Records"}</h3>
                  <p className="text-sm text-slate-500">
                    {admin.role === "deputy_commissioner" ? "Review uploaded khatians - approve, or return with remarks." : "All uploaded khatians, ward-wise, with review status."}
                  </p>
                </Link>
              )}
            </div>
          </>
        )}

        {showTlNotices && (
          <>
            <h2 className={groupHeadingClass}>Trade Licence Field Check</h2>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              <DashboardGroup id="tl-field" title="Trade Licence Field Check" description="Business visits, notice printing, and the notices issued with their status." icon={<ClipboardCheck className="h-6 w-6" strokeWidth={1.8} />} highlight={(tlRemovals ?? 0) > 0}>
                {showTlSurvey && (
                  <Link href="/admin/tl-survey" className={cardClass}>
                    <span className={iconWrapClass}>
                      <ClipboardCheck className="h-6 w-6" strokeWidth={1.8} />
                    </span>
                    <h3 className="mb-1.5 text-base font-semibold text-slate-900">Trade Licence Check</h3>
                    <p className="text-sm text-slate-500">Record a business visit - licence photo if it has one, otherwise a 14-day notice is generated.</p>
                  </Link>
                )}
                {showTlSurvey && (
                  <Link href="/admin/tl-notices-print" className={cardClass}>
                    <span className={iconWrapClass}>
                      <Printer className="h-6 w-6" strokeWidth={1.8} />
                    </span>
                    <h3 className="mb-1.5 text-base font-semibold text-slate-900">Print Trade Licence Notices</h3>
                    <p className="text-sm text-slate-500">End-of-day printing of today&apos;s notices and automatic second notices, for the City Manager&apos;s signature.</p>
                  </Link>
                )}
                <Link href="/admin/tl-notices" className={deskCardClass(tlRemovals)}>
                  <span className={deskIconWrapClass(tlRemovals)}>
                    <FileText className="h-6 w-6" strokeWidth={1.8} />
                  </span>
                  <h3 className="mb-1.5 text-base font-semibold text-slate-900">{showTlSurvey ? "My Trade Licence Visits" : "Trade Licence Notices"}</h3>
                  <p className="text-sm text-slate-500">
                    {tlRemovals
                      ? `${tlRemovals} receiving cop${tlRemovals === 1 ? "y" : "ies"} - removal waiting for your approval.`
                      : "Businesses checked, notice status (1st, 2nd, legal action due), receiving copies and licences obtained after notice."}
                  </p>
                </Link>
              </DashboardGroup>
            </div>
          </>
        )}

        {propertyGroupVisible && (
          <>
            <h2 className={groupHeadingClass}>Property Tax</h2>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {showTaxCollectorPage && (
                <Link href="/admin/tax-collector" className={cardClass}>
                  <span className={iconWrapClass}>
                    <Receipt className="h-6 w-6" strokeWidth={1.8} />
                  </span>
                  <h3 className="mb-1.5 text-base font-semibold text-slate-900">Tax Collection</h3>
                  <p className="text-sm text-slate-500">Search a holding, view pendency, collect tax, issue a receipt.</p>
                </Link>
              )}

              {showHistoricalPayments && (
                <Link href="/admin/historical-payments" className={deskCardClass(historicalPending)}>
                  <span className={deskIconWrapClass(historicalPending)}>
                    <History className="h-6 w-6" strokeWidth={1.8} />
                  </span>
                  <h3 className="mb-1.5 text-base font-semibold text-slate-900">
                    Historical Part Payments
                    {historicalPending ? <span className="ml-2 rounded-full bg-red-600 px-2 py-0.5 text-xs text-white">{historicalPending}</span> : null}
                  </h3>
                  <p className="text-sm text-slate-500">
                    Old holdings paid in parts over the years: record the old payments and settle them year by year from the earliest pending year.
                  </p>
                </Link>
              )}

              <DashboardGroup id="mutation" title="Mutation" description="Mutation approvals, online mutation applications and new holding requests." icon={<FileClock className="h-6 w-6" strokeWidth={1.8} />} highlight={(myStagePendingCount ?? 0) > 0 || (actsOnNewHolding && (newHoldingWaiting ?? 0) > 0)}>
                {showMutationApprovals && (
                  <Link href="/admin/change-requests" className={deskCardClass(myStagePendingCount)}>
                    <span className={deskIconWrapClass(myStagePendingCount)}>
                      <FileClock className="h-6 w-6" strokeWidth={1.8} />
                    </span>
                    <h3 className="mb-1.5 text-base font-semibold text-slate-900">{admin.role === "tax_surveyor" ? "Mutation Field Reports" : "Mutation Approvals"}</h3>
                    <p className="text-sm text-slate-500">
                      {myStagePendingCount === null
                        ? admin.role === "tax_surveyor"
                          ? "Mutations assigned to you for a field report."
                          : "Review property change requests waiting on your desk."
                        : `${myStagePendingCount} request${myStagePendingCount === 1 ? "" : "s"} currently waiting on your desk.`}
                    </p>
                  </Link>
                )}
                {showMutationApplications && (
                  <Link href="/admin/mutation-applications" className={cardClass}>
                    <span className={iconWrapClass}>
                      <FileText className="h-6 w-6" strokeWidth={1.8} />
                    </span>
                    <h3 className="mb-1.5 text-base font-semibold text-slate-900">Online Mutation Applications</h3>
                    <p className="text-sm text-slate-500">Applications from the public window, their documents and progress; holdings to be identified.</p>
                  </Link>
                )}
                {showNewHoldingRequests && (
                  <Link href="/admin/new-holding-requests" className={actsOnNewHolding ? deskCardClass(newHoldingWaiting) : cardClass}>
                    <span className={actsOnNewHolding ? deskIconWrapClass(newHoldingWaiting) : iconWrapClass}>
                      <Home className="h-6 w-6" strokeWidth={1.8} />
                    </span>
                    <h3 className="mb-1.5 text-base font-semibold text-slate-900">New Holding Requests</h3>
                    <p className="text-sm text-slate-500">
                      {newHoldingWaiting === null || !actsOnNewHolding
                        ? "Public requests for properties never assessed: demand register no., field report, comments, approval - the MMC- holding is created."
                        : `${newHoldingWaiting} request${newHoldingWaiting === 1 ? "" : "s"} waiting on your desk.`}
                    </p>
                  </Link>
                )}
              </DashboardGroup>

              <DashboardGroup id="collection" title="Collection" description="Field collection receipts, payment reconciliation, collection &amp; field reports, collection issues and holdings collected on a day." icon={<Landmark className="h-6 w-6" strokeWidth={1.8} />} highlight={showCollectionIssues && (ciDesk ?? 0) > 0}>
                {showBulkReceipts && (
                  <Link href="/admin/bulk-receipts" className={cardClass}>
                    <span className={iconWrapClass}>
                      <Printer className="h-6 w-6" strokeWidth={1.8} />
                    </span>
                    <h3 className="mb-1.5 text-base font-semibold text-slate-900">Field Collection Receipts</h3>
                    <p className="text-sm text-slate-500">Print a day&apos;s receipts Tax Collector-wise, to stamp and hand over.</p>
                  </Link>
                )}
                {showInstrumentReconciliation && (
                  <Link href="/admin/instrument-reconciliation" className={cardClass}>
                    <span className={iconWrapClass}>
                      <Landmark className="h-6 w-6" strokeWidth={1.8} />
                    </span>
                    <h3 className="mb-1.5 text-base font-semibold text-slate-900">Payment Reconciliation</h3>
                    <p className="text-sm text-slate-500">Reconcile card, UPI, online banking, cheque and DD collections with the bank credit, or mark them bounced.</p>
                  </Link>
                )}
                {showAgencyReports && (
                  <Link href="/admin/agency-reports" className={cardClass}>
                    <span className={iconWrapClass}>
                      <BarChart3 className="h-6 w-6" strokeWidth={1.8} />
                    </span>
                    <h3 className="mb-1.5 text-base font-semibold text-slate-900">Collection & Field Reports</h3>
                    <p className="text-sm text-slate-500">Collection, notice distribution, resurvey flags, new houses and collection issues - by ward and collector, daily to annual.</p>
                  </Link>
                )}
                {showCollectionIssues && (
                  <Link href="/admin/collection-issues" className={deskCardClass(ciDesk)}>
                    <span className={deskIconWrapClass(ciDesk)}>
                      <FileWarning className="h-6 w-6" strokeWidth={1.8} />
                    </span>
                    <h3 className="mb-1.5 text-base font-semibold text-slate-900">Collection Issues</h3>
                    <p className="text-sm text-slate-500">
                      {admin.role === "city_manager" && ciCounts?.open
                        ? `${ciCounts.open} open issue(s) waiting for your notice.`
                        : admin.role === "deputy_commissioner" && ciCounts?.removals
                          ? `${ciCounts.removals} receiving cop${ciCounts.removals === 1 ? "y" : "ies"} - removal waiting for your approval.`
                          : admin.role === "city_manager"
                            ? "Issue the standard legal notice for reported collection issues and mark them resolved."
                            : `Collection issues reported by Tax Collectors - open, notice issued, resolved.${ciCounts ? ` ${ciCounts.open} open, ${ciCounts.notice_issued} with notice.` : ""}`}
                    </p>
                  </Link>
                )}
                {showCollectedHoldings && (
                  <Link href="/admin/collected-holdings" className={cardClass}>
                    <span className={iconWrapClass}>
                      <CalendarDays className="h-6 w-6" strokeWidth={1.8} />
                    </span>
                    <h3 className="mb-1.5 text-base font-semibold text-slate-900">Holdings Collected on a Day</h3>
                    <p className="text-sm text-slate-500">Every holding whose tax was collected on a chosen day, with amount, mode and collector - each opens its property-wise report.</p>
                  </Link>
                )}
                {showDuesReport && (
                  <Link href="/admin/dues-report" className={cardClass}>
                    <span className={iconWrapClass}>
                      <FileSpreadsheet className="h-6 w-6" strokeWidth={1.8} />
                    </span>
                    <h3 className="mb-1.5 text-base font-semibold text-slate-900">Holdings with Dues (Excel)</h3>
                    <p className="text-sm text-slate-500">Holding no., old holding no., ward, mobile, tax paid till and amount pending - for targeting collection.</p>
                  </Link>
                )}
              </DashboardGroup>

              <DashboardGroup id="property-records" title="Property Records" description="Manage properties, property-wise report, uploaded holdings, disputed holdings, field survey flags, all property changes, old holding rows, pre-2011 ARV entry and discrepancy approvals." icon={<ClipboardCheck className="h-6 w-6" strokeWidth={1.8} />} highlight={(myDiscrepancyPendingCount ?? 0) > 0 || (solidWastePendingCount ?? 0) > 0 || (migDesk && (migPending ?? 0) > 0)}>
                {showRenumberHolding && (
                  <Link href="/admin/properties-manage" className={cardClass}>
                    <span className={iconWrapClass}>
                      <RefreshCw className="h-6 w-6" strokeWidth={1.8} />
                    </span>
                    <h3 className="mb-1.5 text-base font-semibold text-slate-900">Manage Properties</h3>
                    <p className="text-sm text-slate-500">Renumber, rename, delete, or bulk-clean up holding numbers.</p>
                  </Link>
                )}
                {showAgencyPropertyReports && (
                  <Link href="/admin/property-wise-report" className={cardClass}>
                    <span className={iconWrapClass}>
                      <Home className="h-6 w-6" strokeWidth={1.8} />
                    </span>
                    <h3 className="mb-1.5 text-base font-semibold text-slate-900">Property-wise Report</h3>
                    <p className="text-sm text-slate-500">Search a holding for full details, dues, demand notices, payments and field visits.</p>
                  </Link>
                )}
                {showPropertyWiseReport && (
                  <Link href="/admin/property-wise-report" className={cardClass}>
                    <span className={iconWrapClass}>
                      <Home className="h-6 w-6" strokeWidth={1.8} />
                    </span>
                    <h3 className="mb-1.5 text-base font-semibold text-slate-900">Property-wise Report</h3>
                    <p className="text-sm text-slate-500">Search a holding for full details, tax pending, change log, discrepancy/re-survey flags, and surveyor visits.</p>
                  </Link>
                )}
                {showHoldingImportReview && (
                  <Link href="/admin/holding-imports" className={deskCardClass(resolutionsWaiting)}>
                    <span className={deskIconWrapClass(resolutionsWaiting)}>
                      <ClipboardCheck className="h-6 w-6" strokeWidth={1.8} />
                    </span>
                    <h3 className="mb-1.5 text-base font-semibold text-slate-900">
                      {isCommissioner || admin.role === "deputy_commissioner" ? "Uploaded Holdings - Progress" : "Uploaded Holdings - Review"}
                      {resolutionsWaiting ? <span className="ml-2 rounded-full bg-red-600 px-2 py-0.5 text-xs text-white">{resolutionsWaiting}</span> : null}
                    </h3>
                    <p className="text-sm text-slate-500">
                      {isCommissioner || admin.role === "deputy_commissioner"
                        ? "Follow each bulk upload, and approve how held-back holdings are resolved - imported, merged into the live holding, or dropped."
                        : admin.role === "city_manager"
                          ? "Give final approval - integrate uploaded holdings into the live data: all, selected, or all except a few."
                          : "Review bulk-uploaded holdings and keep out any that should not go live. The City Manager gives final approval."}
                    </p>
                  </Link>
                )}
                {showDisputedHoldings && (
                  <Link href="/admin/disputed-holdings" className={cardClass}>
                    <span className={iconWrapClass}>
                      <AlertTriangle className="h-6 w-6" strokeWidth={1.8} />
                    </span>
                    <h3 className="mb-1.5 text-base font-semibold text-slate-900">Disputed Holdings</h3>
                    <p className="text-sm text-slate-500">Flag a holding after an owner objection - no payment, no demand notice and hidden from public search until cleared.</p>
                  </Link>
                )}
                {showResurveyFlags && (
                  <Link href="/admin/resurvey-flags" className={cardClass}>
                    <span className={iconWrapClass}>
                      <FileWarning className="h-6 w-6" strokeWidth={1.8} />
                    </span>
                    <h3 className="mb-1.5 text-base font-semibold text-slate-900">Re-Survey Flags</h3>
                    <p className="text-sm text-slate-500">Holdings flagged by Tax Collectors as looking different on the ground.</p>
                  </Link>
                )}
                {showAllPropertyChanges && (
                  <Link href="/admin/all-changes" className={cardClass}>
                    <span className={iconWrapClass}>
                      <LayoutGrid className="h-6 w-6" strokeWidth={1.8} />
                    </span>
                    <h3 className="mb-1.5 text-base font-semibold text-slate-900">All Property Changes</h3>
                    <p className="text-sm text-slate-500">Every mutation request, done and in process, grouped by category.</p>
                  </Link>
                )}
                {(isCommissioner || admin.role === "tax_daroga") && (
                  <Link href="/admin/migrated-holdings-review" className={cardClass}>
                    <span className={iconWrapClass}>
                      <ClipboardCheck className="h-6 w-6" strokeWidth={1.8} />
                    </span>
                    <h3 className="mb-1.5 text-base font-semibold text-slate-900">Old Holdings - Rows to Review</h3>
                    <p className="text-sm text-slate-500">Rows of the old-holding upload that were held back: see the issue, correct and import, or discard - one by one.</p>
                  </Link>
                )}
                {["tax_daroga", "city_manager", "deputy_commissioner", "commissioner"].includes(admin.role) && <Pre2011ArvCard role={admin.role} />}
                {showPropertyDiscrepancyRequests && (
                  <Link href="/admin/property-discrepancy-requests" className={deskCardClass(myDiscrepancyPendingCount)}>
                    <span className={deskIconWrapClass(myDiscrepancyPendingCount)}>
                      <ClipboardCheck className="h-6 w-6" strokeWidth={1.8} />
                    </span>
                    <h3 className="mb-1.5 text-base font-semibold text-slate-900">Property Discrepancy Approvals</h3>
                    <p className="text-sm text-slate-500">
                      {myDiscrepancyPendingCount === null
                        ? "Review a Tax Collector's field-found correction at your stage."
                        : `${myDiscrepancyPendingCount} request${myDiscrepancyPendingCount === 1 ? "" : "s"} currently waiting on your desk.`}
                    </p>
                  </Link>
                )}
                {showReportPropertyDiscrepancy && (
                  <Link href="/admin/report-property-discrepancy" className={cardClass}>
                    <span className={iconWrapClass}>
                      <AlertTriangle className="h-6 w-6" strokeWidth={1.8} />
                    </span>
                    <h3 className="mb-1.5 text-base font-semibold text-slate-900">Report Property Discrepancy</h3>
                    <p className="text-sm text-slate-500">Found something that doesn&apos;t match the records? Submit the corrected details for review.</p>
                  </Link>
                )}
                {showMyDiscrepancyReports && (
                  <Link href="/admin/my-discrepancy-reports" className={cardClass}>
                    <span className={iconWrapClass}>
                      <ClipboardList className="h-6 w-6" strokeWidth={1.8} />
                    </span>
                    <h3 className="mb-1.5 text-base font-semibold text-slate-900">My Discrepancy Reports</h3>
                    <p className="text-sm text-slate-500">See what you&apos;ve reported and its status - including any sent back for correction.</p>
                  </Link>
                )}
                {showMigApprovals && (
                  <Link href="/admin/mig-records" className={migDesk ? deskCardClass(migPending) : cardClass}>
                    <span className={migDesk ? deskIconWrapClass(migPending) : iconWrapClass}>
                      <ClipboardCheck className="h-6 w-6" strokeWidth={1.8} />
                    </span>
                    <h3 className="mb-1.5 text-base font-semibold text-slate-900">Old Records (MIG) - Approvals</h3>
                    <p className="text-sm text-slate-500">
                      {migDesk && migPending
                        ? `${migPending.toLocaleString("en-IN")} uploaded old record(s) waiting on your desk.`
                        : admin.role === "tax_daroga"
                          ? "Review the uploaded old records verified by the Operator and forward them to the City Manager."
                          : admin.role === "city_manager"
                            ? "Approve the uploaded old records forwarded by the Tax Daroga - each gets its MIG- number."
                            : `Uploaded old records - Operator verifies, Tax Daroga forwards, City Manager approves (MIG-).${migPending ? ` ${migPending.toLocaleString("en-IN")} awaiting approval.` : ""}`}
                    </p>
                  </Link>
                )}
                {showSolidWasteApprovals && (
                  <Link href="/admin/solid-waste-approvals" className={deskCardClass(solidWastePendingCount)}>
                    <span className={deskIconWrapClass(solidWastePendingCount)}>
                      <ClipboardCheck className="h-6 w-6" strokeWidth={1.8} />
                    </span>
                    <h3 className="mb-1.5 text-base font-semibold text-slate-900">Solid Waste User Type Approvals</h3>
                    <p className="text-sm text-slate-500">
                      {solidWastePendingCount
                        ? `${solidWastePendingCount} waiting on your desk.`
                        : admin.role === "tax_daroga"
                          ? "Approve solid waste user types entered by Tax Collectors (final)."
                          : "Approve solid waste user types still waiting at your stage."}
                    </p>
                  </Link>
                )}
              </DashboardGroup>

              <DashboardGroup id="demand-notices" title="Demand Notices" description="Bulk and ward-wise demand notices, receiving copies, notices report and cancellation requests." icon={<FileWarning className="h-6 w-6" strokeWidth={1.8} />} highlight={false}>
                {showBulkDemandNotices && (
                  <Link href="/admin/demand-notices" className={cardClass}>
                    <span className={iconWrapClass}>
                      <FileWarning className="h-6 w-6" strokeWidth={1.8} />
                    </span>
                    <h3 className="mb-1.5 text-base font-semibold text-slate-900">Bulk Demand Notices</h3>
                    <p className="text-sm text-slate-500">Generate demand notices for every holding that doesn&apos;t have one yet.</p>
                  </Link>
                )}
                {showAgencyNotices && (
                  <Link href="/admin/agency-notices" className={cardClass}>
                    <span className={iconWrapClass}>
                      <Printer className="h-6 w-6" strokeWidth={1.8} />
                    </span>
                    <h3 className="mb-1.5 text-base font-semibold text-slate-900">Ward-wise Demand Notices</h3>
                    <p className="text-sm text-slate-500">Print the demand notices of all holdings with dues pending in a ward, as 1-2 PDF files.</p>
                  </Link>
                )}
                {showNoticeReceivingUpload && (
                  <Link href="/admin/notice-receiving-upload" className={cardClass}>
                    <span className={iconWrapClass}>
                      <FileText className="h-6 w-6" strokeWidth={1.8} />
                    </span>
                    <h3 className="mb-1.5 text-base font-semibold text-slate-900">Upload Notice Receiving Copy</h3>
                    <p className="text-sm text-slate-500">Photograph and upload the signed receiving slip torn from a printed demand notice (up to 2 photos per notice).</p>
                  </Link>
                )}
                {showNoticeReceivingCopies && (
                  <Link href="/admin/notice-receiving-copies" className={cardClass}>
                    <span className={iconWrapClass}>
                      <Receipt className="h-6 w-6" strokeWidth={1.8} />
                    </span>
                    <h3 className="mb-1.5 text-base font-semibold text-slate-900">Notice Receiving Copies</h3>
                    <p className="text-sm text-slate-500">Read-only list of signed demand notice copies uploaded by Tax Collectors.</p>
                  </Link>
                )}
                {showDuesReport && (
                  <Link href="/admin/notice-reports" className={cardClass}>
                    <span className={iconWrapClass}>
                      <CalendarDays className="h-6 w-6" strokeWidth={1.8} />
                    </span>
                    <h3 className="mb-1.5 text-base font-semibold text-slate-900">Notices Report</h3>
                    <p className="text-sm text-slate-500">Demand notices served, trade licence notices issued and applications received - by day or period, ward-wise and Tax Collector-wise.</p>
                  </Link>
                )}
                {showCancellationRequests && (
                  <Link href="/admin/cancellation-requests" className={cardClass}>
                    <span className={iconWrapClass}>
                      <XCircle className="h-6 w-6" strokeWidth={1.8} />
                    </span>
                    <h3 className="mb-1.5 text-base font-semibold text-slate-900">Cancellation Requests</h3>
                    <p className="text-sm text-slate-500">Requests to cancel a demand notice or payment receipt.</p>
                  </Link>
                )}
              </DashboardGroup>

              <DashboardGroup id="property-upload" title="Migrated Holding Surveys" description="Assigning old holdings for survey, the surveyor's work and final sign-off." icon={<Upload className="h-6 w-6" strokeWidth={1.8} />} highlight={false}>

                {showMigratedHoldingsAssign && (
                  <Link href="/admin/migrated-holdings-assign" className={cardClass}>
                    <span className={iconWrapClass}>
                      <UserCheck className="h-6 w-6" strokeWidth={1.8} />
                    </span>
                    <h3 className="mb-1.5 text-base font-semibold text-slate-900">Migrated Holding Surveys</h3>
                    <p className="text-sm text-slate-500">Assign old holdings to a Tax Daroga and give final sign-off.</p>
                  </Link>
                )}
              </DashboardGroup>

              <DashboardGroup id="field-survey" title="Field Survey" description="Surveys, field work, old records (MIG) and missing houses." icon={<MapPin className="h-6 w-6" strokeWidth={1.8} />} highlight={false}>
                {admin.role === "tax_surveyor" && (
                  <Link href="/admin/my-field-work" className={cardClass}>
                    <span className={iconWrapClass}>
                      <ClipboardList className="h-6 w-6" strokeWidth={1.8} />
                    </span>
                    <h3 className="mb-1.5 text-base font-semibold text-slate-900">My Field Work</h3>
                    <p className="text-sm text-slate-500">Everything assigned to you - new holdings, mutations, remeasurements and old holding surveys - in one list.</p>
                  </Link>
                )}
                {showMigratedHoldingsSurveyor && (
                  <Link href="/admin/migrated-holdings-surveyor" className={cardClass}>
                    <span className={iconWrapClass}>
                      <ClipboardList className="h-6 w-6" strokeWidth={1.8} />
                    </span>
                    <h3 className="mb-1.5 text-base font-semibold text-slate-900">My Migrated Holding Surveys</h3>
                    <p className="text-sm text-slate-500">Assign to a Tax Surveyor, verify submissions, revert if needed.</p>
                  </Link>
                )}
                {showMigratedHoldingsMySurveys && (
                  <Link href="/admin/migrated-holdings-my-surveys" className={cardClass}>
                    <span className={iconWrapClass}>
                      <ClipboardList className="h-6 w-6" strokeWidth={1.8} />
                    </span>
                    <h3 className="mb-1.5 text-base font-semibold text-slate-900">My Surveys</h3>
                    <p className="text-sm text-slate-500">Enter real floor-wise details for old holdings assigned to you.</p>
                  </Link>
                )}
                {showInitiateSurvey && (
                  <Link href="/admin/initiate-survey" className={cardClass}>
                    <span className={iconWrapClass}>
                      <ClipboardCheck className="h-6 w-6" strokeWidth={1.8} />
                    </span>
                    <h3 className="mb-1.5 text-base font-semibold text-slate-900">Initiate Survey / Resurvey</h3>
                    <p className="text-sm text-slate-500">Search any holding number to start its survey or resurvey directly.</p>
                  </Link>
                )}
                {showOldRecords && (
                  <Link href="/admin/old-records" className={cardClass}>
                    <span className={iconWrapClass}>
                      <ClipboardList className="h-6 w-6" strokeWidth={1.8} />
                    </span>
                    <h3 className="mb-1.5 text-base font-semibold text-slate-900">Old Records (MIG)</h3>
                    <p className="text-sm text-slate-500">
                      Old houses with an old tax receipt but no MUNG id: find the old record ward-wise (old holding no., PID, owner) and add its full details.
                    </p>
                  </Link>
                )}
                {showUnsurveyedHouseEntry && (
                  <Link href="/admin/unsurveyed-house-entry" className={cardClass}>
                    <span className={iconWrapClass}>
                      <Home className="h-6 w-6" strokeWidth={1.8} />
                    </span>
                    <h3 className="mb-1.5 text-base font-semibold text-slate-900">Record Missing House</h3>
                    <p className="text-sm text-slate-500">A house you found that is in neither the holding database nor the old MUNG-MIG data - GPS, photo, ward, address, landmark.</p>
                  </Link>
                )}
                {showUnsurveyedHouses && (
                  <Link href="/admin/unsurveyed-houses" className={cardClass}>
                    <span className={iconWrapClass}>
                      <List className="h-6 w-6" strokeWidth={1.8} />
                    </span>
                    <h3 className="mb-1.5 text-base font-semibold text-slate-900">Missing Houses List</h3>
                    <p className="text-sm text-slate-500">Houses recorded as missing - found on the ground but in no record. Read-only.</p>
                  </Link>
                )}
              </DashboardGroup>

              <DashboardGroup id="staff" title="Staff &amp; Assignments" description="Collection staff documents (KYC), Tax Surveyor wards, surveyor and Tax Collector assignments." icon={<UserCheck className="h-6 w-6" strokeWidth={1.8} />} highlight={(kycPending ?? 0) > 0}>
                {showStaffKyc && (
                  <Link href="/admin/staff-kyc" className={deskCardClass(kycPending)}>
                    <span className={deskIconWrapClass(kycPending)}>
                      <ShieldCheck className="h-6 w-6" strokeWidth={1.8} />
                    </span>
                    <h3 className="mb-1.5 text-base font-semibold text-slate-900">
                      {isKycStaff ? "My Identity Documents" : "Collection Staff Documents"}
                      {kycPending ? <span className="ml-2 rounded-full bg-red-600 px-2 py-0.5 text-xs text-white">{kycPending}</span> : null}
                    </h3>
                    <p className="text-sm text-slate-500">
                      {isKycStaff
                        ? "Your passport photograph, Aadhaar, PAN, appointment letter, ID card and police verification, and their approval."
                        : admin.role === "tax_daroga"
                          ? "Upload passport photograph, Aadhaar, PAN, appointment letter, ID card and police verification of collection staff for approval."
                          : "Passport photograph, Aadhaar, PAN, appointment letter, ID card and police verification of collection staff - review to activate their logins."}
                    </p>
                  </Link>
                )}
                {isCommissioner && (
                  <Link href="/admin/surveyor-wards" className={cardClass}>
                    <span className={iconWrapClass}>
                      <MapIcon className="h-6 w-6" strokeWidth={1.8} />
                    </span>
                    <h3 className="mb-1.5 text-base font-semibold text-slate-900">Tax Surveyor Wards</h3>
                    <p className="text-sm text-slate-500">Give wards to Tax Surveyors - requests from a ward go to its surveyor automatically.</p>
                  </Link>
                )}
                {showSurveyorAssignments && (
                  <Link href="/admin/surveyor-assignments" className={cardClass}>
                    <span className={iconWrapClass}>
                      <UserCheck className="h-6 w-6" strokeWidth={1.8} />
                    </span>
                    <h3 className="mb-1.5 text-base font-semibold text-slate-900">Surveyor Assignments</h3>
                    <p className="text-sm text-slate-500">
                      {admin.role === "tax_daroga"
                        ? "Give new holding, mutation and remeasurement requests to a specific Tax Surveyor."
                        : "See which Tax Surveyor has each new holding, mutation and remeasurement request."}
                    </p>
                  </Link>
                )}
                {showTaxCollectorAssignments && (
                  <Link href="/admin/tax-collector-assignments" className={cardClass}>
                    <span className={iconWrapClass}>
                      <UserCheck className="h-6 w-6" strokeWidth={1.8} />
                    </span>
                    <h3 className="mb-1.5 text-base font-semibold text-slate-900">Tax Collector Assignments</h3>
                    <p className="text-sm text-slate-500">Choose which City Manager reviews each Tax Collector&apos;s cancellation requests.</p>
                  </Link>
                )}
              </DashboardGroup>
            </div>
          </>
        )}

        {shopGroupVisible && (
          <>
            <h2 className={groupHeadingClass}>Shops</h2>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              <DashboardGroup id="shop-approvals" title="Shop Approvals" description="Agreement approvals, agreement documents, shops pending publication, edit approvals and demand / receipt actions." icon={<ClipboardCheck className="h-6 w-6" strokeWidth={1.8} />} highlight={(myShopStagePendingCount ?? 0) > 0}>
                {showShopAgreementApprovals && (
                  <Link href="/admin/shop-agreement-requests" className={deskCardClass(myShopStagePendingCount)}>
                    <span className={deskIconWrapClass(myShopStagePendingCount)}>
                      <ShoppingBag className="h-6 w-6" strokeWidth={1.8} />
                    </span>
                    <h3 className="mb-1.5 text-base font-semibold text-slate-900">Shop Agreement Approvals</h3>
                    <p className="text-sm text-slate-500">
                      {myShopStagePendingCount === null
                        ? "Review shop agreement requests waiting on your desk."
                        : `${myShopStagePendingCount} request${myShopStagePendingCount === 1 ? "" : "s"} currently waiting on your desk.`}
                    </p>
                  </Link>
                )}
                {showShopAgreementDocumentRequests && (
                  <Link href="/admin/shop-agreement-document-requests" className={cardClass}>
                    <span className={iconWrapClass}>
                      <FileClock className="h-6 w-6" strokeWidth={1.8} />
                    </span>
                    <h3 className="mb-1.5 text-base font-semibold text-slate-900">Shop Agreement Document Approvals</h3>
                    <p className="text-sm text-slate-500">Review uploaded/changed agreement PDFs waiting on your stage.</p>
                  </Link>
                )}
                {showShopsPendingPublication && (
                  <Link href="/admin/shops-pending-publication" className={cardClass}>
                    <span className={iconWrapClass}>
                      <ShieldCheck className="h-6 w-6" strokeWidth={1.8} />
                    </span>
                    <h3 className="mb-1.5 text-base font-semibold text-slate-900">Shops Pending Publication</h3>
                    <p className="text-sm text-slate-500">Review newly-entered shops before they&apos;re publicly listed as available.</p>
                  </Link>
                )}
                {showShopEditApprovals && (
                  <Link href="/admin/shop-edit-requests" className={cardClass}>
                    <span className={iconWrapClass}>
                      <FileClock className="h-6 w-6" strokeWidth={1.8} />
                    </span>
                    <h3 className="mb-1.5 text-base font-semibold text-slate-900">Shop Edit Approvals</h3>
                    <p className="text-sm text-slate-500">Review proposed edits to existing shops&apos; details.</p>
                  </Link>
                )}
                {showDemandReceiptActions && (
                  <Link href="/admin/shop-demand-actions" className={cardClass}>
                    <span className={iconWrapClass}>
                      <XCircle className="h-6 w-6" strokeWidth={1.8} />
                    </span>
                    <h3 className="mb-1.5 text-base font-semibold text-slate-900">Demand / Receipt Actions</h3>
                    <p className="text-sm text-slate-500">Cancel or supersede a demand notice, or cancel a payment receipt.</p>
                  </Link>
                )}
              </DashboardGroup>

              <DashboardGroup id="shop-rentals" title="Shop Rentals" description="Rental applications, rental preferences and the rate per sqft." icon={<Store className="h-6 w-6" strokeWidth={1.8} />} highlight={(myRentalAppPendingCount ?? 0) > 0}>
                {showShopRentalApplications && (
                  <Link href="/admin/shop-rental-applications" className={deskCardClass(myRentalAppPendingCount)}>
                    <span className={deskIconWrapClass(myRentalAppPendingCount)}>
                      <Store className="h-6 w-6" strokeWidth={1.8} />
                    </span>
                    <h3 className="mb-1.5 text-base font-semibold text-slate-900">Shop Rental Applications</h3>
                    <p className="text-sm text-slate-500">
                      {myRentalAppPendingCount === null
                        ? "Review new tenant applications waiting on your desk."
                        : `${myRentalAppPendingCount} application${myRentalAppPendingCount === 1 ? "" : "s"} currently waiting on your desk.`}
                    </p>
                  </Link>
                )}
                {showShopRentalPreferences && (
                  <Link href="/admin/shop-rental-preferences" className={cardClass}>
                    <span className={iconWrapClass}>
                      <Store className="h-6 w-6" strokeWidth={1.8} />
                    </span>
                    <h3 className="mb-1.5 text-base font-semibold text-slate-900">Shop Rental Preferences</h3>
                    <p className="text-sm text-slate-500">Match market/size/bid preferences to vacant shops and allot one.</p>
                  </Link>
                )}
                {showShopRateReport && (
                  <Link href="/admin/shop-rate-report" className={cardClass}>
                    <span className={iconWrapClass}>
                      <BarChart3 className="h-6 w-6" strokeWidth={1.8} />
                    </span>
                    <h3 className="mb-1.5 text-base font-semibold text-slate-900">Shop Rate per Sqft</h3>
                    <p className="text-sm text-slate-500">See which occupied shops are renting below market rate.</p>
                  </Link>
                )}
              </DashboardGroup>

              <DashboardGroup id="shop-records" title="Shop Records" description="Shop inspection, shop-wise report, flagged shops, bulk upload and manage shops." icon={<ShoppingBag className="h-6 w-6" strokeWidth={1.8} />} highlight={false}>
                {showShopInspection && (
                  <Link href="/admin/shop-inspection" className={cardClass}>
                    <span className={iconWrapClass}>
                      <ClipboardCheck className="h-6 w-6" strokeWidth={1.8} />
                    </span>
                    <h3 className="mb-1.5 text-base font-semibold text-slate-900">Shop Inspection</h3>
                    <p className="text-sm text-slate-500">Search a shop and record irregularities found on-site.</p>
                  </Link>
                )}
                {showShopWiseReport && (
                  <Link href="/admin/shop-wise-report" className={cardClass}>
                    <span className={iconWrapClass}>
                      <Store className="h-6 w-6" strokeWidth={1.8} />
                    </span>
                    <h3 className="mb-1.5 text-base font-semibold text-slate-900">Shop-wise Report</h3>
                    <p className="text-sm text-slate-500">Every shop, filterable by market - open one for full details, agreement history, and to flag issues.</p>
                  </Link>
                )}
                {showShopFlags && (
                  <Link href="/admin/shop-flags" className={cardClass}>
                    <span className={iconWrapClass}>
                      <Flag className="h-6 w-6" strokeWidth={1.8} />
                    </span>
                    <h3 className="mb-1.5 text-base font-semibold text-slate-900">Flagged Shops</h3>
                    <p className="text-sm text-slate-500">Respond to shops the Commissioner or City Manager flagged for correction or justification.</p>
                  </Link>
                )}
                {showBulkUploadShops && (
                  <Link href="/admin/shops-bulk-upload" className={cardClass}>
                    <span className={iconWrapClass}>
                      <Store className="h-6 w-6" strokeWidth={1.8} />
                    </span>
                    <h3 className="mb-1.5 text-base font-semibold text-slate-900">Bulk Upload Shops</h3>
                    <p className="text-sm text-slate-500">Import shops and their current tenancy from a CSV file.</p>
                  </Link>
                )}
                {showManageShops && (
                  <Link href="/admin/shops-manage" className={cardClass}>
                    <span className={iconWrapClass}>
                      <Trash2 className="h-6 w-6" strokeWidth={1.8} />
                    </span>
                    <h3 className="mb-1.5 text-base font-semibold text-slate-900">Manage Shops</h3>
                    <p className="text-sm text-slate-500">Delete a shop entered in error - blocked if it has any active payments.</p>
                  </Link>
                )}
              </DashboardGroup>
            </div>
          </>
        )}

        {tradeLicenseGroupVisible && (
          <>
            <h2 className={groupHeadingClass}>Trade License</h2>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {showTradeLicenseApplications && (
                <Link href="/admin/trade-license-requests" className={deskCardClass(myTradeLicensePendingCount)}>
                  <span className={deskIconWrapClass(myTradeLicensePendingCount)}>
                    <Award className="h-6 w-6" strokeWidth={1.8} />
                  </span>
                  <h3 className="mb-1.5 text-base font-semibold text-slate-900">Trade License Applications</h3>
                  <p className="text-sm text-slate-500">
                    {myTradeLicensePendingCount === null
                      ? "Review trade license applications waiting on your desk."
                      : `${myTradeLicensePendingCount} application${myTradeLicensePendingCount === 1 ? "" : "s"} currently waiting on your desk.`}
                  </p>
                </Link>
              )}

              {showTradeLicenseReporting && (
                <Link href="/admin/trade-license-dashboard" className={cardClass}>
                  <span className={iconWrapClass}>
                    <BarChart3 className="h-6 w-6" strokeWidth={1.8} />
                  </span>
                  <h3 className="mb-1.5 text-base font-semibold text-slate-900">Trade License - Reporting</h3>
                  <p className="text-sm text-slate-500">Received, pendency, disposal rate, and anything overdue 2+ weeks.</p>
                </Link>
              )}
            </div>
          </>
        )}

        {streetlightGroupVisible && (
          <>
            <h2 className={groupHeadingClass}>Streetlights</h2>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {isStreetlightReporterRole && (
                <Link href="/admin/report-streetlight-fault" className={cardClass}>
                  <span className={iconWrapClass}>
                    <AlertTriangle className="h-6 w-6" strokeWidth={1.8} />
                  </span>
                  <h3 className="mb-1.5 text-base font-semibold text-slate-900">Report Streetlight Fault</h3>
                  <p className="text-sm text-slate-500">Report a damaged or non-functional streetlight noticed in the field.</p>
                </Link>
              )}

              {showStreetlightReports && (
                <Link href="/admin/streetlight-reports" className={cardClass}>
                  <span className={iconWrapClass}>
                    <BarChart3 className="h-6 w-6" strokeWidth={1.8} />
                  </span>
                  <h3 className="mb-1.5 text-base font-semibold text-slate-900">Street Light Reports</h3>
                  <p className="text-sm text-slate-500">Ward-wise, street-wise and agency-wise reports, downloadable for Excel.</p>
                </Link>
              )}

            </div>
          </>
        )}

        {employeeDatabaseGroupVisible && (
          <>
            <h2 className={groupHeadingClass}>Employee Database</h2>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {showEmployeeDatabaseEntry && (
                <Link href="/admin/employee-database-entry" className={cardClass}>
                  <span className={iconWrapClass}>
                    <Users className="h-6 w-6" strokeWidth={1.8} />
                  </span>
                  <h3 className="mb-1.5 text-base font-semibold text-slate-900">Employee Database Entry</h3>
                  <p className="text-sm text-slate-500">Search by Aadhaar to correct/delete a record, or add a new one.</p>
                </Link>
              )}

              {showEmployeeDatabaseList && (
                <Link href="/admin/employee-database-list" className={cardClass}>
                  <span className={iconWrapClass}>
                    <List className="h-6 w-6" strokeWidth={1.8} />
                  </span>
                  <h3 className="mb-1.5 text-base font-semibold text-slate-900">All Employee Records</h3>
                  <p className="text-sm text-slate-500">Every record entered so far, with verification status.</p>
                </Link>
              )}

              {showEmployeeDatabaseVerify && (
                <Link href="/admin/employee-database-verify" className={cardClass}>
                  <span className={iconWrapClass}>
                    <UserCheck className="h-6 w-6" strokeWidth={1.8} />
                  </span>
                  <h3 className="mb-1.5 text-base font-semibold text-slate-900">Employee Records - Verification</h3>
                  <p className="text-sm text-slate-500">Verify new employee database entries.</p>
                </Link>
              )}

              {showEmployeeDatabaseProgress && (
                <Link href="/admin/employee-database-progress" className={cardClass}>
                  <span className={iconWrapClass}>
                    <BarChart3 className="h-6 w-6" strokeWidth={1.8} />
                  </span>
                  <h3 className="mb-1.5 text-base font-semibold text-slate-900">Employee Database Progress</h3>
                  <p className="text-sm text-slate-500">How the municipal employee database build-out is going.</p>
                </Link>
              )}
            </div>
          </>
        )}

        {miscGroupVisible && (
          <>
            <h2 className={groupHeadingClass}>Administration &amp; Maps</h2>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              <DashboardGroup id="administration" title="Administration" description="Crematorium, community halls, garden entry tickets, logins, operators, document archive, website documents and Who&apos;s Who, attendance report and revert audit trail." icon={<ShieldCheck className="h-6 w-6" strokeWidth={1.8} />} highlight={admin.role === "commissioner" && (hallApplications ?? 0) > 0}>
                {showGardens && (
                  <Link href="/admin/crematorium" className={cardClass}>
                    <span className={iconWrapClass}>
                      <Flame className="h-6 w-6" strokeWidth={1.8} />
                    </span>
                    <h3 className="mb-1.5 text-base font-semibold text-slate-900">Electric Crematorium</h3>
                    <p className="text-sm text-slate-500">Cremation tickets cut at every counter, collection by counter and payment mode, and the cremation fee.</p>
                  </Link>
                )}
                {showGardens && (
                  <Link href="/admin/community-halls" className={deskCardClass(admin.role === "commissioner" ? hallApplications : null)}>
                    <span className={deskIconWrapClass(admin.role === "commissioner" ? hallApplications : null)}>
                      <Building2 className="h-6 w-6" strokeWidth={1.8} />
                    </span>
                    <h3 className="mb-1.5 text-base font-semibold text-slate-900">Community Hall Bookings</h3>
                    <p className="text-sm text-slate-500">
                      {admin.role === "commissioner" && hallApplications
                        ? `${hallApplications} application${hallApplications > 1 ? "s" : ""} waiting for approval.`
                        : "Halls, rent and deposit, applications, payments and deposit refunds."}
                    </p>
                  </Link>
                )}
                {showGardens && (
                  <Link href="/admin/gardens" className={cardClass}>
                    <span className={iconWrapClass}>
                      <Trees className="h-6 w-6" strokeWidth={1.8} />
                    </span>
                    <h3 className="mb-1.5 text-base font-semibold text-slate-900">Garden Entry Tickets</h3>
                    <p className="text-sm text-slate-500">Gardens and entry fee, counter logins, QR poster, and the daily ticket collection report.</p>
                  </Link>
                )}
                {showManageLogins && (
                  <Link href="/admin/manage-logins" className={cardClass}>
                    <span className={iconWrapClass}>
                      <ShieldCheck className="h-6 w-6" strokeWidth={1.8} />
                    </span>
                    <h3 className="mb-1.5 text-base font-semibold text-slate-900">Manage Logins</h3>
                    <p className="text-sm text-slate-500">Activate or deactivate Tax Daroga, Tax Collector, and other officer logins.</p>
                  </Link>
                )}
                {showWhosWho && (
                  <Link href="/whos-who-manager?as=admin" className={cardClass}>
                    <span className={iconWrapClass}>
                      <UserCheck className="h-6 w-6" strokeWidth={1.8} />
                    </span>
                    <h3 className="mb-1.5 text-base font-semibold text-slate-900">Website Who&apos;s Who</h3>
                    <p className="text-sm text-slate-500">
                      {admin.role === "city_manager"
                        ? "Verify Who's Who entries made by operators and forward them to the DMC."
                        : admin.role === "deputy_commissioner"
                          ? "Approve verified Who's Who entries and publish them on the website."
                          : "See the Who's Who entries and where each one is in the approval chain."}
                    </p>
                  </Link>
                )}
                {showOperators && (
                  <Link href="/admin/operators" className={cardClass}>
                    <span className={iconWrapClass}>
                      <Users className="h-6 w-6" strokeWidth={1.8} />
                    </span>
                    <h3 className="mb-1.5 text-base font-semibold text-slate-900">Operators</h3>
                    <p className="text-sm text-slate-500">Activate or deactivate counter operator accounts.</p>
                  </Link>
                )}
                {showDocumentArchive && (
                  <Link href="/admin/document-archive" className={cardClass}>
                    <span className={iconWrapClass}>
                      <Archive className="h-6 w-6" strokeWidth={1.8} />
                    </span>
                    <h3 className="mb-1.5 text-base font-semibold text-slate-900">Document Archive</h3>
                    <p className="text-sm text-slate-500">Look up any past demand notice, receipt, or violation notice - view only.</p>
                  </Link>
                )}
                {showPublicDocuments && (
                  <Link href="/admin/public-documents" className={cardClass}>
                    <span className={iconWrapClass}>
                      <FileText className="h-6 w-6" strokeWidth={1.8} />
                    </span>
                    <h3 className="mb-1.5 text-base font-semibold text-slate-900">Website Documents &amp; Reports</h3>
                    <p className="text-sm text-slate-500">Upload reports and documents to publish on the public website.</p>
                  </Link>
                )}
                {showAttendanceReport && (
                  <Link href="/admin/attendance-report" className={cardClass}>
                    <span className={iconWrapClass}>
                      <Download className="h-6 w-6" strokeWidth={1.8} />
                    </span>
                    <h3 className="mb-1.5 text-base font-semibold text-slate-900">Field Staff Attendance Report</h3>
                    <p className="text-sm text-slate-500">Download the monthly attendance CSV for sanitation staff and drivers.</p>
                  </Link>
                )}
                {showRevertAuditTrail && (
                  <Link href="/admin/revert-audit-trail" className={cardClass}>
                    <span className={iconWrapClass}>
                      <RotateCcw className="h-6 w-6" strokeWidth={1.8} />
                    </span>
                    <h3 className="mb-1.5 text-base font-semibold text-slate-900">Revert Audit Trail</h3>
                    <p className="text-sm text-slate-500">Property mutations and shop agreements sent back to operators for correction.</p>
                  </Link>
                )}
              </DashboardGroup>

              <DashboardGroup id="maps" title="Maps &amp; Building Permits" description="Holding coordinates, GIS map and building plan permits." icon={<MapIcon className="h-6 w-6" strokeWidth={1.8} />} highlight={false}>
                {showAssignCoordinates && (
                  <Link href="/admin/assign-coordinates" className={cardClass}>
                    <span className={iconWrapClass}>
                      <MapPin className="h-6 w-6" strokeWidth={1.8} />
                    </span>
                    <h3 className="mb-1.5 text-base font-semibold text-slate-900">Assign Holding Coordinates</h3>
                    <p className="text-sm text-slate-500">Search a holding and capture its GPS point or boundary polygon.</p>
                  </Link>
                )}
                {showGisMap && (
                  <Link href="/admin/gis-map" className={cardClass}>
                    <span className={iconWrapClass}>
                      <MapIcon className="h-6 w-6" strokeWidth={1.8} />
                    </span>
                    <h3 className="mb-1.5 text-base font-semibold text-slate-900">GIS Map</h3>
                    <p className="text-sm text-slate-500">View every holding&apos;s assigned coordinates on one map.</p>
                  </Link>
                )}
                {showBuildingMapApproval && (
                  <Link href="/admin/building-permits" className={cardClass}>
                    <span className={iconWrapClass}>
                      <ClipboardCheck className="h-6 w-6" strokeWidth={1.8} />
                    </span>
                    <h3 className="mb-1.5 text-base font-semibold text-slate-900">Building Plan Permits</h3>
                    <p className="text-sm text-slate-500">Online building plan applications - site reports, scrutiny, fee, approval and permits issued (view).</p>
                  </Link>
                )}
              </DashboardGroup>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

/** A Garden Counter login has only the ticket counter. */
function OpenScreen({ href, label }: { href: string; label: string }) {
  useEffect(() => {
    window.location.replace(href);
  }, [href]);
  return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Opening {label}…</div>;
}

function GardenCounterRedirect() {
  useEffect(() => {
    window.location.replace("/admin/garden-counter");
  }, []);
  return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Opening the garden counter…</div>;
}
