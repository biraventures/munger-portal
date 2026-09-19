"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Users, FileClock, FileWarning, LayoutGrid, ShoppingBag, Store, BarChart3, Award, Archive, Download, XCircle, ShieldCheck, Trash2, RefreshCw, Upload, MapPin, Map as MapIcon, ClipboardCheck, UserCheck, ClipboardList, Receipt, RotateCcw, AlertTriangle, Lightbulb, Route, Clock, List } from "lucide-react";
import { AdminHeader } from "@/components/admin-header";
import { DashboardSummaryWidget } from "@/components/dashboard-summary-widget";
import { useAdminGuard } from "@/lib/use-admin-guard";
import {
  fetchChangeRequests,
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

export default function AdminDashboardPage() {
  const admin = useAdminGuard();
  const [myStagePendingCount, setMyStagePendingCount] = useState<number | null>(null);
  const [myShopStagePendingCount, setMyShopStagePendingCount] = useState<number | null>(null);
  const [myRentalAppPendingCount, setMyRentalAppPendingCount] = useState<number | null>(null);
  const [myTradeLicensePendingCount, setMyTradeLicensePendingCount] = useState<number | null>(null);

  useEffect(() => {
    if (!admin) return;
    fetchChangeRequests({ status: "pending", myStage: true })
      .then((r) => setMyStagePendingCount(r.requests.length))
      .catch(() => setMyStagePendingCount(null));
    fetchShopAgreementRequests({ status: "pending", myStage: true })
      .then((r) => setMyShopStagePendingCount(r.requests.length))
      .catch(() => setMyShopStagePendingCount(null));
    fetchRentalApplications({ status: "pending", myStage: true })
      .then((r) => setMyRentalAppPendingCount(r.applications.length))
      .catch(() => setMyRentalAppPendingCount(null));
    fetchTradeLicenseApplications({ status: "pending", myStage: true })
      .then((r) => setMyTradeLicensePendingCount(r.applications.length))
      .catch(() => setMyTradeLicensePendingCount(null));
  }, [admin]);

  if (!admin) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

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
  const isRestrictedRole = isStallPrabhari || isTradeLicenseNodal || isGisOnlyRole || admin.role === "je_mechanical" || admin.role === "ae_mechanical" || admin.role === "establishment_clerk";
  const canApproveShopPublication = admin.role === "stall_prabhari" || admin.role === "city_manager" || admin.role === "deputy_commissioner";
  const canApproveDemandActions = admin.role === "stall_prabhari" || admin.role === "city_manager";
  const isCommissioner = admin.role === "commissioner";

  // Pre-computed per-card visibility so each grouped section's heading
  // can be hidden entirely when none of its cards apply to this role,
  // rather than showing an empty section.
  const isMutationChainRole = admin.role === "tax_daroga" || admin.role === "mutation_nodal_clerk" || admin.role === "deputy_commissioner" || isCommissioner;
  const showMutationApprovals = isMutationChainRole;
  const showCancellationRequests = !isRestrictedRole;
  const showTaxCollectors = !isRestrictedRole;
  const showBulkDemandNotices = !isRestrictedRole;
  const showAllPropertyChanges = isCommissioner;
  const showRenumberHolding = isCommissioner;
  const showBulkUploadProperties = isCommissioner;
  const showMigratedHoldingsBulkUpload = isCommissioner;
  const showMigratedHoldingsAssign = admin.role === "deputy_commissioner" || admin.role === "city_manager";
  const showMigratedHoldingsSurveyor = admin.role === "tax_daroga";
  const showMigratedHoldingsMySurveys = admin.role === "tax_surveyor";
  const showTaxCollectorPage = admin.role === "tax_collector";
  const showResurveyFlags = admin.role === "tax_daroga" || admin.role === "commissioner";
  const showTaxCollectorAssignments = isCommissioner;
  const showRevertAuditTrail = isCommissioner;
  const showEmployeeDatabaseEntry = admin.role === "establishment_clerk";
  const showEmployeeDatabaseList = admin.role === "establishment_clerk";
  const showEmployeeDatabaseVerify = admin.role === "city_manager";
  const showEmployeeDatabaseProgress = isCommissioner;
  const showStreetlightCommissionerTools = isCommissioner;
  const isStreetlightReporterRole =
    admin.role === "tax_daroga" || admin.role === "tax_surveyor" || admin.role === "tax_collector" || admin.role === "stall_prabhari" || admin.role === "je_mechanical" || admin.role === "ae_mechanical";
  const propertyGroupVisible =
    showMutationApprovals || showCancellationRequests || showTaxCollectors || showBulkDemandNotices || showAllPropertyChanges || showRenumberHolding || showBulkUploadProperties ||
    showMigratedHoldingsBulkUpload || showMigratedHoldingsAssign || showMigratedHoldingsSurveyor || showMigratedHoldingsMySurveys || showTaxCollectorPage || showResurveyFlags || showTaxCollectorAssignments || showRevertAuditTrail;

  const showShopAgreementApprovals = !isTradeLicenseNodal && !isGisOnlyRole;
  const showShopRentalApplications = !isTradeLicenseNodal && !isGisOnlyRole;
  const showShopRentalPreferences = !isTradeLicenseNodal && !isGisOnlyRole;
  const showShopRateReport = !isTradeLicenseNodal && !isGisOnlyRole;
  const showShopsPendingPublication = canApproveShopPublication;
  const showShopEditApprovals = canApproveShopPublication;
  const showShopAgreementDocumentRequests = canApproveShopPublication;
  const showDemandReceiptActions = canApproveDemandActions;
  const showBulkUploadShops = isCommissioner;
  const showManageShops = isCommissioner;
  const showShopInspection = admin.role === "city_manager" || admin.role === "deputy_commissioner";
  const shopGroupVisible =
    showShopAgreementApprovals ||
    showShopRentalApplications ||
    showShopRentalPreferences ||
    showShopRateReport ||
    showShopsPendingPublication ||
    showShopEditApprovals ||
    showDemandReceiptActions ||
    showShopInspection ||
    showShopAgreementDocumentRequests ||
    showBulkUploadShops ||
    showManageShops;

  const showTradeLicenseApplications = !isStallPrabhari && !isGisOnlyRole;
  const showTradeLicenseReporting = !isStallPrabhari && !isGisOnlyRole;
  const tradeLicenseGroupVisible = showTradeLicenseApplications || showTradeLicenseReporting;

  const showOperators = !isRestrictedRole;
  const showDocumentArchive = !isRestrictedRole;
  const showAttendanceReport = isCommissioner;
  const showAssignCoordinates = isAtps || isCommissioner;
  const showGisMap = isAtps || isAssistantArchitect || isCommissioner;
  const showBuildingMapApproval = isAssistantArchitect;
  const miscGroupVisible = showOperators || showDocumentArchive || showAttendanceReport || showAssignCoordinates || showGisMap || showBuildingMapApproval;
  const employeeDatabaseGroupVisible = showEmployeeDatabaseEntry || showEmployeeDatabaseList || showEmployeeDatabaseVerify || showEmployeeDatabaseProgress;
  const streetlightGroupVisible = showStreetlightCommissionerTools || isStreetlightReporterRole;

  const groupHeadingClass = "mb-4 mt-10 text-lg font-semibold text-slate-800 first:mt-0";
  const cardClass = "flex flex-col rounded-xl border border-slate-200 bg-white p-6 transition-shadow hover:shadow-md";
  const iconWrapClass = "mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-nnm-blue";

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminHeader admin={admin} />

      <main className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="mb-1 text-2xl font-semibold text-slate-900">Welcome, {admin.displayName}</h1>
        <p className="mb-8 text-sm text-slate-500">Signed in as {ADMIN_ROLE_LABELS[admin.role]}.</p>

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

        {propertyGroupVisible && (
          <>
            <h2 className={groupHeadingClass}>Property Tax</h2>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {showMutationApprovals && (
                <Link href="/admin/change-requests" className={cardClass}>
                  <span className={iconWrapClass}>
                    <FileClock className="h-6 w-6" strokeWidth={1.8} />
                  </span>
                  <h3 className="mb-1.5 text-base font-semibold text-slate-900">Mutation Approvals</h3>
                  <p className="text-sm text-slate-500">
                    {myStagePendingCount === null
                      ? "Review property change requests waiting on your desk."
                      : `${myStagePendingCount} request${myStagePendingCount === 1 ? "" : "s"} currently waiting on your desk.`}
                  </p>
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

              {showTaxCollectors && (
                <Link href="/admin/tax-collectors" className={cardClass}>
                  <span className={iconWrapClass}>
                    <Users className="h-6 w-6" strokeWidth={1.8} />
                  </span>
                  <h3 className="mb-1.5 text-base font-semibold text-slate-900">Tax Collectors</h3>
                  <p className="text-sm text-slate-500">Add field collectors and their codes for payment tracking.</p>
                </Link>
              )}

              {showBulkDemandNotices && (
                <Link href="/admin/demand-notices" className={cardClass}>
                  <span className={iconWrapClass}>
                    <FileWarning className="h-6 w-6" strokeWidth={1.8} />
                  </span>
                  <h3 className="mb-1.5 text-base font-semibold text-slate-900">Bulk Demand Notices</h3>
                  <p className="text-sm text-slate-500">Generate demand notices for every holding that doesn&apos;t have one yet.</p>
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

              {showRenumberHolding && (
                <Link href="/admin/properties-manage" className={cardClass}>
                  <span className={iconWrapClass}>
                    <RefreshCw className="h-6 w-6" strokeWidth={1.8} />
                  </span>
                  <h3 className="mb-1.5 text-base font-semibold text-slate-900">Manage Properties</h3>
                  <p className="text-sm text-slate-500">Renumber, rename, delete, or bulk-clean up holding numbers.</p>
                </Link>
              )}

              {showBulkUploadProperties && (
                <Link href="/admin/properties-bulk-upload" className={cardClass}>
                  <span className={iconWrapClass}>
                    <Upload className="h-6 w-6" strokeWidth={1.8} />
                  </span>
                  <h3 className="mb-1.5 text-base font-semibold text-slate-900">Bulk Upload Properties</h3>
                  <p className="text-sm text-slate-500">Import holdings, floors, tax history, and payments from a backup file.</p>
                </Link>
              )}

              {showMigratedHoldingsBulkUpload && (
                <Link href="/admin/migrated-holdings-bulk-upload" className={cardClass}>
                  <span className={iconWrapClass}>
                    <Upload className="h-6 w-6" strokeWidth={1.8} />
                  </span>
                  <h3 className="mb-1.5 text-base font-semibold text-slate-900">Bulk Upload Old Holdings</h3>
                  <p className="text-sm text-slate-500">Import old paper-record holdings (MUNG-MIG-) pending survey.</p>
                </Link>
              )}

              {showMigratedHoldingsAssign && (
                <Link href="/admin/migrated-holdings-assign" className={cardClass}>
                  <span className={iconWrapClass}>
                    <UserCheck className="h-6 w-6" strokeWidth={1.8} />
                  </span>
                  <h3 className="mb-1.5 text-base font-semibold text-slate-900">Migrated Holding Surveys</h3>
                  <p className="text-sm text-slate-500">Assign old holdings to a Tax Daroga and give final sign-off.</p>
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

              {showTaxCollectorPage && (
                <Link href="/admin/tax-collector" className={cardClass}>
                  <span className={iconWrapClass}>
                    <Receipt className="h-6 w-6" strokeWidth={1.8} />
                  </span>
                  <h3 className="mb-1.5 text-base font-semibold text-slate-900">Tax Collection</h3>
                  <p className="text-sm text-slate-500">Search a holding, view pendency, collect tax, issue a receipt.</p>
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

              {showTaxCollectorAssignments && (
                <Link href="/admin/tax-collector-assignments" className={cardClass}>
                  <span className={iconWrapClass}>
                    <UserCheck className="h-6 w-6" strokeWidth={1.8} />
                  </span>
                  <h3 className="mb-1.5 text-base font-semibold text-slate-900">Tax Collector Assignments</h3>
                  <p className="text-sm text-slate-500">Choose which City Manager reviews each Tax Collector&apos;s cancellation requests.</p>
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
            </div>
          </>
        )}

        {shopGroupVisible && (
          <>
            <h2 className={groupHeadingClass}>Shops</h2>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {showShopAgreementApprovals && (
                <Link href="/admin/shop-agreement-requests" className={cardClass}>
                  <span className={iconWrapClass}>
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

              {showShopRentalApplications && (
                <Link href="/admin/shop-rental-applications" className={cardClass}>
                  <span className={iconWrapClass}>
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

              {showShopInspection && (
                <Link href="/admin/shop-inspection" className={cardClass}>
                  <span className={iconWrapClass}>
                    <ClipboardCheck className="h-6 w-6" strokeWidth={1.8} />
                  </span>
                  <h3 className="mb-1.5 text-base font-semibold text-slate-900">Shop Inspection</h3>
                  <p className="text-sm text-slate-500">Search a shop and record irregularities found on-site.</p>
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
            </div>
          </>
        )}

        {tradeLicenseGroupVisible && (
          <>
            <h2 className={groupHeadingClass}>Trade License</h2>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {showTradeLicenseApplications && (
                <Link href="/admin/trade-license-requests" className={cardClass}>
                  <span className={iconWrapClass}>
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

              {showStreetlightCommissionerTools && (
                <Link href="/admin/streetlights-bulk-upload" className={cardClass}>
                  <span className={iconWrapClass}>
                    <Lightbulb className="h-6 w-6" strokeWidth={1.8} />
                  </span>
                  <h3 className="mb-1.5 text-base font-semibold text-slate-900">Streetlight Bulk Upload</h3>
                  <p className="text-sm text-slate-500">Import street-wise light inventory from a Nagar Nigam or EESL CSV.</p>
                </Link>
              )}

              {showStreetlightCommissionerTools && (
                <Link href="/admin/street-segments" className={cardClass}>
                  <span className={iconWrapClass}>
                    <Route className="h-6 w-6" strokeWidth={1.8} />
                  </span>
                  <h3 className="mb-1.5 text-base font-semibold text-slate-900">Street Segments</h3>
                  <p className="text-sm text-slate-500">Add or update GPS for each street&apos;s start and end points.</p>
                </Link>
              )}

              {showStreetlightCommissionerTools && (
                <Link href="/admin/streetlight-city-manager" className={cardClass}>
                  <span className={iconWrapClass}>
                    <UserCheck className="h-6 w-6" strokeWidth={1.8} />
                  </span>
                  <h3 className="mb-1.5 text-base font-semibold text-slate-900">Streetlight City Manager</h3>
                  <p className="text-sm text-slate-500">Choose which City Manager follows up on streetlight faults.</p>
                </Link>
              )}

              {showStreetlightCommissionerTools && (
                <Link href="/admin/streetlight-delay-report" className={cardClass}>
                  <span className={iconWrapClass}>
                    <Clock className="h-6 w-6" strokeWidth={1.8} />
                  </span>
                  <h3 className="mb-1.5 text-base font-semibold text-slate-900">Streetlight Delay Report</h3>
                  <p className="text-sm text-slate-500">How long streetlight repairs are taking against the 72-hour deadline.</p>
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
            <h2 className={groupHeadingClass}>Miscellaneous</h2>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
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

              {showAttendanceReport && (
                <Link href="/admin/attendance-report" className={cardClass}>
                  <span className={iconWrapClass}>
                    <Download className="h-6 w-6" strokeWidth={1.8} />
                  </span>
                  <h3 className="mb-1.5 text-base font-semibold text-slate-900">Field Staff Attendance Report</h3>
                  <p className="text-sm text-slate-500">Download the monthly attendance CSV for sanitation staff and drivers.</p>
                </Link>
              )}

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
                <Link href="/admin/building-map-approval" className={cardClass}>
                  <span className={iconWrapClass}>
                    <ClipboardCheck className="h-6 w-6" strokeWidth={1.8} />
                  </span>
                  <h3 className="mb-1.5 text-base font-semibold text-slate-900">Building Map Approval</h3>
                  <p className="text-sm text-slate-500">Review and approve submitted building maps.</p>
                </Link>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
