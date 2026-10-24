import { collectorHoldingParam, collectorDemandNoticeParam } from "../middleware/collectorWardGuard";
import { Router } from "express";
import {
  getBulkReceiptCollectors,
  getBulkReceipts,
  getInstruments,
  postBounceInstrument,
  postPmVerifyInstrument,
  postReconcileInstrument,
} from "../controllers/fieldCollection.controller";
import { listOperators, setOperatorActive } from "../controllers/adminOperators.controller";
import {
  getChangeRequests,
  getChangeRequestById,
  postApproveChangeRequest,
  postRejectChangeRequest,
  postRevertChangeRequest,
  getChangeRequestTimeline,
  getApplicationTimeline,
  getMutationPendingSummary,
  getHoldingLineage,
} from "../controllers/changeRequest.controller";
import {
  getDiscrepancyRequests,
  getMyDiscrepancyRequests,
  getDiscrepancyRequestById,
  postApproveDiscrepancyRequest,
  postRejectDiscrepancyRequest,
  postRevertDiscrepancyRequest,
  postResubmitDiscrepancyRequest,
  getDiscrepancyPhoto,
} from "../controllers/propertyDiscrepancy.controller";
import { getFieldVerificationPhoto } from "../controllers/propertyFieldVerification.controller";
import {
  getCancellationRequests,
  postApproveCancellation,
  postRejectCancellation,
} from "../controllers/cancellationRequest.controller";
import { getDemandRefreshRuns, postBulkGenerateDemandNotices } from "../controllers/demandNotice.controller";
import { postBulkRegenerateTaxHistory } from "../controllers/adminTaxHistory.controller";
import { getDataExport } from "../controllers/export.controller";
import {
  getShopAgreementRequests,
  getShopAgreementRequestById,
  postApproveShopAgreementRequest,
  postRejectShopAgreementRequest,
  postRevertShopAgreementRequest,
} from "../controllers/shopAgreement.controller";
import { listAllShops, getPerSqftReport, uploadShopsCsvHandler } from "../controllers/shop.controller";
import { deleteShopHandler } from "../controllers/shopDelete.controller";
import { getShopReportHandler } from "../controllers/shopReport.controller";
import { createShopFlagHandler, listShopFlagsForShopHandler, listOpenShopFlagsHandler, resolveShopFlagHandler } from "../controllers/shopFlag.controller";
import { postRenumberHolding, postRenameHolding, postFixHoldingNoSpaces } from "../controllers/propertyRenumber.controller";
import { deletePropertyHandler } from "../controllers/propertyDelete.controller";
import { getSpacedHoldings, postDeleteSpacedHoldings, postRemoveDuplicateFloors } from "../controllers/propertyBulkCleanup.controller";
import {
  searchPropertiesForGeo,
  listAllPropertyGeoHandler,
  getPropertyGeo,
  putPropertyGeo,
  getGeoProgress,
  listInfrastructureLinesHandler,
  createInfrastructureLineHandler,
  updateInfrastructureLineHandler,
  deleteInfrastructureLineHandler,
  importInfrastructureLinesKmlHandler,
  listWardBoundariesHandler,
  importWardBoundariesKmlHandler,
  deleteWardBoundaryHandler,
  exportGeoData,
} from "../controllers/geo.controller";
import {
  uploadPropertiesXlsxHandler,
  listImportBatchesHandler,
  getImportBatchHandler,
  getImportHoldingHandler,
  excludeImportHoldingsHandler,
  restoreImportHoldingsHandler,
  reviewImportHoldingsHandler,
  integrateImportHandler,
  discardImportHandler,
  previewResidentialSolidWasteHandler,
  applyResidentialSolidWasteHandler,
} from "../controllers/propertyBulkImport.controller";
import { searchPropertiesHandler, getPropertyReportHandler } from "../controllers/propertyReport.controller";
import { getShopsPendingPublication, postApproveShopPublication } from "../controllers/shopPublicationApproval.controller";
import {
  getShopEditRequests,
  getShopEditRequestById,
  postApproveShopEditRequest,
  postRejectShopEditRequest,
} from "../controllers/shopEditRequest.controller";
import {
  listShopAgreementDocumentRequestsHandler,
  getShopAgreementDocumentRequestFile,
  approveShopAgreementDocumentRequestHandler,
  rejectShopAgreementDocumentRequestHandler,
} from "../controllers/shopAgreementDocument.controller";
import { postCreateShopInspection, listShopInspectionsForShop, listAllShopInspections } from "../controllers/shopInspection.controller";
import {
  uploadMigratedHoldingsHandler,
  listPendingAssignmentHandler,
  listTaxDarogasHandler,
  listTaxSurveyorsHandler,
  assignToSurveyorHandler,
  listMyAssignmentsHandler,
  assignToTaxSurveyorHandler,
  listMySurveysHandler,
  submitSurveyorEntryHandler,
  verifyByTaxDarogaHandler,
  revertToSurveyorHandler,
  listPendingFinalVerificationHandler,
  finalizeVerificationHandler,
  listEventsForHoldingHandler,
  exportMigratedHoldingsHandler,
} from "../controllers/migratedHoldingSurvey.controller";
import { listResurveyFlagsHandler, reviewResurveyFlagHandler, exportResurveyFlagsHandler } from "../controllers/propertyResurveyFlag.controller";
import { listMySolidWasteRequests, postApproveSolidWasteRequest, postRejectSolidWasteRequest } from "../controllers/solidWasteRequest.controller";
import { listAllCollectionIssues, listMyCollectionIssues } from "../controllers/collectionIssue.controller";
import { postGenerateCollectionIssueNotice, getCollectionIssueNotices, getReprintCollectionIssueNotice } from "../controllers/collectionIssueNotice.controller";
import { listTaxCollectorsWithAssignmentHandler, listCityManagersHandler, assignCityManagerHandler, setTaxCollectorWardsHandler } from "../controllers/taxCollectorAssignment.controller";
import { listAdminAccounts, setAdminAccountActive } from "../controllers/adminAccounts.controller";
import { listEntryRevertEventsHandler, exportEntryRevertEventsHandler } from "../controllers/entryRevertEvent.controller";
import {
  postCreateEmployeeHandler,
  searchEmployeeByAadhaarHandler,
  listEmployeesHandler,
  patchUpdateEmployeeHandler,
  deleteEmployeeHandler,
  postVerifyEmployeeHandler,
  getEmployeeDatabaseProgressHandler,
  exportEmployeesHandler,
} from "../controllers/employee.controller";
import {
  listStreetSegmentsHandler,
  listLightsForSegmentHandler,
  reportStreetlightFaultHandler,
  getLightRepairHistorySummaryAdminHandler,
  listStreetlightFaultsHandler,
} from "../controllers/streetlightAdmin.controller";
import {
  getDemandActionRequests,
  getDemandActionRequestById,
  postApproveDemandAction,
  postRejectDemandAction,
} from "../controllers/shopDemandAction.controller";
import { postResolveViolationNotice } from "../controllers/shopViolationNotice.controller";
import {
  getRentalApplications,
  getRentalApplicationById,
  postApproveRentalApplication,
  postRejectRentalApplication,
} from "../controllers/shopRentalApplication.controller";
import {
  getRentalPreferences,
  getRentalPreferenceById,
  getPreferencesMatchingShop,
  postAllotPreference,
  postRejectRentalPreference,
} from "../controllers/shopRentalPreference.controller";
import {
  getTradeLicenseApplications,
  getTradeLicenseApplicationById,
  postApproveTradeLicenseApplication,
  postRejectTradeLicenseApplication,
  getTradeLicenseStats,
  getTradeLicenseDocumentFile,
} from "../controllers/tradeLicenseApplication.controller";
import { requireAdmin, requireAdminRole } from "../middleware/requireAdmin";
import { getPre2011Entries, getPre2011Holding, getPre2011PendingCount, getPre2011Worklist, postPre2011Approve, postPre2011Entry, postPre2011Reject } from "../controllers/pre2011Arv.controller";
import {
  searchMigratedHoldingsHandler,
  createUnsurveyedHouseHandler,
  listUnsurveyedHousesHandler,
  getUnsurveyedHousePhotoHandler,
  listNoticesForReceivingHandler,
  uploadReceivingCopyHandler,
  listReceivingCopiesHandler,
  getReceivingCopyPhotoHandler,
} from "../controllers/collectorField.controller";
import {
  getReportFilterOptionsHandler,
  getAgencyReportHandler,
  exportAgencyReportHandler,
  listAgencyWardsHandler,
  listAgencyWardHoldingsHandler,
  prepareAgencyNoticesHandler,
  printExistingAgencyNoticesHandler,
} from "../controllers/agency.controller";
import { listDisputedHandler, getDisputeStatusHandler, flagDisputedHandler, clearDisputedHandler } from "../controllers/propertyDispute.controller";
import { getStreetlightReportHandler } from "../controllers/streetlightReport.controller";
import {
  listAllPublicDocumentsHandler,
  uploadPublicDocumentHandler,
  getAnyPublicDocumentFileHandler,
  patchPublicDocumentHandler,
  deletePublicDocumentHandler,
} from "../controllers/publicDocument.controller";
import { getKhatianFile, getKhatianHistory, getKhatians, postKhatian, postReviewKhatian } from "../controllers/khatian.controller";
import { getFieldReportPhoto } from "../controllers/fieldReport.controller";
import {
  getMutationApplication,
  getMutationApplicationDocument,
  getMutationApplications,
  postLinkMutationApplication,
  postRejectMutationApplication,
  postReturnToApplicant,
} from "../controllers/mutationApplication.controller";
import {
  getPendingCount as getNewHoldingPendingCount,
  getRequest as getNewHoldingRequest,
  getRequestDocument as getNewHoldingRequestDocument,
  getRequests as getNewHoldingRequests,
  postApprove as postNewHoldingApprove,
  postAssign as postNewHoldingAssign,
  postDarogaForward as postNewHoldingDarogaForward,
  postDmcForward as postNewHoldingDmcForward,
  postFieldReport as postNewHoldingFieldReport,
  postReject as postNewHoldingReject,
  postReturn as postNewHoldingReturn,
  postSendBack as postNewHoldingSendBack,
} from "../controllers/newHoldingRequest.controller";
import {
  getTlNotice,
  getTlPrintQueue,
  getTlSurveyFile,
  getTlSurveys,
  postTlComplied,
  postTlMarkPrinted,
  postTlSurvey,
} from "../controllers/tradeLicenseNotice.controller";

export const adminRouter = Router();

adminRouter.use(requireAdmin);

// Senior-role gate reused across the routes below — operator account
// management, full data export, and system-wide bulk mutations are
// powerful enough that every admin role shouldn't equally reach them,
// even though every admin role legitimately needs the day-to-day
// approval-queue endpoints. Commissioner and Deputy Commissioner sit at
// or near the top of all three approval chains (property, shop, trade
// license), so they're the natural senior-oversight roles here.
const requireSeniorAdmin = requireAdminRole("commissioner", "deputy_commissioner");

// Stall Prabhari's role is specific to the shop agreement/rental
// chain (see SHOP_APPROVAL_STAGE_ORDER) - they're not part of the
// property-tax side of this system at all, so they're excluded from
// mutation approvals, cancellation requests, tax collector management,
// and trade license services below, per what was explicitly asked for.
// The Tax Surveyor is in the chain for the field report of a mutation (only the cases assigned to him - see changeRequest.service).
const requireMutationChainRole = requireAdminRole("tax_daroga", "tax_surveyor", "mutation_nodal_clerk", "deputy_commissioner", "commissioner");
const requireNonStallPrabhari = requireAdminRole(
  "tax_daroga",
  "mutation_nodal_clerk",
  "deputy_commissioner",
  "commissioner",
  "city_manager",
  "trade_license_nodal",
);

// Operator management
adminRouter.get("/operators", requireSeniorAdmin, listOperators);
adminRouter.patch("/operators/:id/active", requireSeniorAdmin, setOperatorActive);

// Admins-table login management (Tax Daroga, Deputy Commissioner,
// Commissioner, Tax Collector, etc.) - Commissioner only, separate from
// the front-counter Operators list above and from the attendance
// module's own /attendance/users screen.
adminRouter.get("/accounts", requireAdminRole("commissioner"), listAdminAccounts);
adminRouter.patch("/accounts/:id/active", requireAdminRole("commissioner"), setAdminAccountActive);

// Property mutation approval queue - restricted to the actual chain's
// roles (tax_daroga -> mutation_nodal_clerk -> deputy_commissioner ->
// commissioner, per migration 005) - Stall Prabhari was never part of
// this chain to begin with, so this also fixes a pre-existing gap
// where it was reachable by every admin role with no restriction at all.
adminRouter.get("/change-requests", requireMutationChainRole, getChangeRequests);
adminRouter.get("/change-requests/:id", requireMutationChainRole, getChangeRequestById);
// Mutation audit trail and the per-desk pending summary - the chain, plus the City Manager who oversees it.
const requireMutationViewRole = requireAdminRole("tax_daroga", "tax_surveyor", "mutation_nodal_clerk", "deputy_commissioner", "commissioner", "city_manager");
adminRouter.get("/field-report-photos/:photoId", requireMutationViewRole, getFieldReportPhoto);
adminRouter.get("/change-requests/:id/timeline", requireMutationViewRole, getChangeRequestTimeline);
adminRouter.get("/mutation-applications/:id/timeline", requireMutationViewRole, getApplicationTimeline);
adminRouter.get("/mutation-pending-summary", requireMutationViewRole, getMutationPendingSummary);
adminRouter.post("/change-requests/:id/approve", requireMutationChainRole, postApproveChangeRequest);
adminRouter.post("/change-requests/:id/reject", requireMutationChainRole, postRejectChangeRequest);
adminRouter.post("/change-requests/:id/revert", requireMutationChainRole, postRevertChangeRequest);

// Property discrepancy approval queue - a Tax Collector's field-found
// correction, restricted to its own chain's roles (tax_surveyor ->
// tax_daroga -> city_manager -> deputy_commissioner, per migration
// 076) plus commissioner, who can see (but isn't a required stage
// for) every approval queue in this system.
const requireDiscrepancyChainRole = requireAdminRole("tax_surveyor", "tax_daroga", "city_manager", "deputy_commissioner", "commissioner");
adminRouter.get("/property-discrepancy-requests", requireDiscrepancyChainRole, getDiscrepancyRequests);
adminRouter.get("/property-discrepancy-requests/mine", requireAdminRole("tax_collector"), getMyDiscrepancyRequests);
adminRouter.get("/property-discrepancy-requests/:id", requireDiscrepancyChainRole, getDiscrepancyRequestById);
adminRouter.get("/property-discrepancy-requests/:id/photo/:kind", requireDiscrepancyChainRole, getDiscrepancyPhoto);
adminRouter.post("/property-discrepancy-requests/:id/approve", requireDiscrepancyChainRole, postApproveDiscrepancyRequest);
adminRouter.post("/property-discrepancy-requests/:id/reject", requireDiscrepancyChainRole, postRejectDiscrepancyRequest);
adminRouter.post("/property-discrepancy-requests/:id/revert", requireDiscrepancyChainRole, postRevertDiscrepancyRequest);
adminRouter.post("/property-discrepancy-requests/:id/resubmit", requireAdminRole("tax_collector"), postResubmitDiscrepancyRequest);

// Field verification photo retrieval - viewable by the two roles who capture them plus the oversight chain.
adminRouter.get(
  "/field-verifications/:id/photo/:kind",
  requireAdminRole("tax_collector", "tax_surveyor", "tax_daroga", "city_manager", "deputy_commissioner", "commissioner"),
  getFieldVerificationPhoto,
);

// Demand notice / receipt cancellation approval queue - viewable by
// any admin role except Stall Prabhari. Approve/reject is tax_daroga
// or city_manager - which one applies to a given request is enforced
// inside the controller/service by that request's own stage (an
// operator's request is tax_daroga-only, as before; a Tax Collector's
// request needs tax_daroga then their assigned City Manager).
const requireCancellationReviewRole = requireAdminRole("tax_daroga", "city_manager");
adminRouter.get("/cancellation-requests", requireNonStallPrabhari, getCancellationRequests);
adminRouter.post("/cancellation-requests/:id/approve", requireCancellationReviewRole, postApproveCancellation);
adminRouter.post("/cancellation-requests/:id/reject", requireCancellationReviewRole, postRejectCancellation);

// Shop agreement approval queue (5-stage: Stall Prabhari -> Tax Daroga NOC -> City Manager -> Deputy Commissioner -> Commissioner)
adminRouter.get("/shop-agreement-requests", getShopAgreementRequests);
adminRouter.get("/shop-agreement-requests/:id", getShopAgreementRequestById);
adminRouter.post("/shop-agreement-requests/:id/approve", postApproveShopAgreementRequest);
adminRouter.post("/shop-agreement-requests/:id/reject", postRejectShopAgreementRequest);
adminRouter.post("/shop-agreement-requests/:id/revert", postRevertShopAgreementRequest);

// Commissioner-only unified audit trail of every revert-to-operator
// event across property mutations and shop agreements. See
// entryRevertEvent.controller.ts.
adminRouter.get("/entry-revert-events", requireAdminRole("commissioner"), listEntryRevertEventsHandler);
adminRouter.get("/entry-revert-events/export", requireAdminRole("commissioner"), exportEntryRevertEventsHandler);

// Streetlights - fault reporting is open to the six field roles who
// notice damage during their regular work; fault viewing is open to
// any admin for coordination. Street-wise bulk import, GPS entry,
// City Manager assignment, and the delay report have shifted to the
// asset management (attendance) login - see streetlightCommissioner.controller.ts
// and streetlight.routes.ts - and are no longer duplicated here.
// See streetlightAdmin.controller.ts.
const requireStreetlightReporterRole = requireAdminRole("tax_daroga", "tax_surveyor", "tax_collector", "stall_prabhari", "je_mechanical", "ae_mechanical", "commissioner", "deputy_commissioner", "city_manager");
adminRouter.get("/street-segments", listStreetSegmentsHandler);
adminRouter.get("/street-segments/:id/lights", requireStreetlightReporterRole, listLightsForSegmentHandler);
adminRouter.post("/streetlight-faults", requireStreetlightReporterRole, reportStreetlightFaultHandler);
adminRouter.get("/lights/:id/repair-history-summary", requireAdminRole("commissioner"), getLightRepairHistorySummaryAdminHandler);
adminRouter.get("/streetlight-faults", listStreetlightFaultsHandler);

// Ward-wise / street-wise / agency-wise street light reports (on-screen + CSV download).
adminRouter.get(
  "/streetlight-reports/:kind",
  requireAdminRole("commissioner", "deputy_commissioner", "city_manager", "je_mechanical", "ae_mechanical"),
  getStreetlightReportHandler,
);

// Municipal employee database - Establishment Clerk enters records,
// City Manager verifies, Commissioner sees overall progress. See
// employee.controller.ts.
const requireEmployeeViewRole = requireAdminRole("establishment_clerk", "city_manager", "commissioner");
adminRouter.post("/employees", requireAdminRole("establishment_clerk"), postCreateEmployeeHandler);
adminRouter.get("/employees/search", requireAdminRole("establishment_clerk"), searchEmployeeByAadhaarHandler);
adminRouter.get("/employees", requireEmployeeViewRole, listEmployeesHandler);
adminRouter.get("/employees/export", requireEmployeeViewRole, exportEmployeesHandler);
adminRouter.patch("/employees/:id", requireAdminRole("establishment_clerk"), patchUpdateEmployeeHandler);
adminRouter.delete("/employees/:id", requireAdminRole("establishment_clerk"), deleteEmployeeHandler);
adminRouter.post("/employees/:id/verify", requireAdminRole("city_manager"), postVerifyEmployeeHandler);
adminRouter.get("/employees/progress", requireAdminRole("commissioner"), getEmployeeDatabaseProgressHandler);

adminRouter.get("/shops", listAllShops);
adminRouter.post("/shops/bulk-upload", requireAdminRole("commissioner"), uploadShopsCsvHandler);

// Disputed holdings - flagged after an owner objection (Tax Daroga, City Manager, Commissioner).
const requireDisputeRole = requireAdminRole("tax_daroga", "city_manager", "commissioner");
adminRouter.get("/disputed-holdings", requireDisputeRole, listDisputedHandler);
adminRouter.get("/property-dispute/:holdingNo", requireDisputeRole, getDisputeStatusHandler);
adminRouter.post("/property-dispute/:holdingNo/flag", requireDisputeRole, flagDisputedHandler);
adminRouter.post("/property-dispute/:holdingNo/clear", requireDisputeRole, clearDisputedHandler);

// Public website documents/reports - Commissioner only.
adminRouter.get("/public-documents", requireAdminRole("commissioner"), listAllPublicDocumentsHandler);
adminRouter.post("/public-documents", requireAdminRole("commissioner"), uploadPublicDocumentHandler);
adminRouter.get("/public-documents/:id/file", requireAdminRole("commissioner"), getAnyPublicDocumentFileHandler);
adminRouter.patch("/public-documents/:id", requireAdminRole("commissioner"), patchPublicDocumentHandler);
adminRouter.delete("/public-documents/:id", requireAdminRole("commissioner"), deletePublicDocumentHandler);
adminRouter.delete("/shops/:shopNo", requireAdminRole("commissioner"), deleteShopHandler);

// Shop-wise report (Commissioner/City Manager): full detail + agreement
// history + edit-request change log + flags for one shop, and flagging
// something on it for Stall Prabhari to correct or justify. See
// shopReport.controller.ts / shopFlag.controller.ts / migration 090.
adminRouter.get("/shops/:shopNo/report", requireAdminRole("commissioner", "city_manager"), getShopReportHandler);
adminRouter.get("/shops/:shopNo/flags", requireAdminRole("commissioner", "city_manager", "stall_prabhari"), listShopFlagsForShopHandler);
adminRouter.post("/shops/:shopNo/flags", requireAdminRole("commissioner", "city_manager"), createShopFlagHandler);
adminRouter.get("/shop-flags/open", requireAdminRole("stall_prabhari"), listOpenShopFlagsHandler);
adminRouter.post("/shop-flags/:id/resolve", requireAdminRole("stall_prabhari"), resolveShopFlagHandler);
adminRouter.post("/properties/:holdingNo/renumber", requireAdminRole("commissioner"), postRenumberHolding);
adminRouter.post("/properties/:holdingNo/rename", requireAdminRole("commissioner"), postRenameHolding);
adminRouter.delete("/properties/:holdingNo", requireAdminRole("commissioner"), deletePropertyHandler);
adminRouter.post("/properties/fix-holding-no-spaces", requireAdminRole("commissioner"), postFixHoldingNoSpaces);
adminRouter.get("/properties/spaced-holdings", requireAdminRole("commissioner"), getSpacedHoldings);
adminRouter.post("/properties/spaced-holdings/delete-all", requireAdminRole("commissioner"), postDeleteSpacedHoldings);
adminRouter.post("/properties/remove-duplicate-floors", requireAdminRole("commissioner"), postRemoveDuplicateFloors);
// Bulk holding uploads are staged for review, not imported. Tax Daroga and City Manager review the staged
// holdings (Tax Daroga can keep holdings out); the FINAL approval - integrating into the live data (all /
// selected / all except some) or discarding - is the City Manager's alone. The Commissioner sees progress only.
adminRouter.post("/properties/bulk-upload", requireAdminRole("commissioner", "tax_daroga", "city_manager"), uploadPropertiesXlsxHandler);
adminRouter.get("/property-imports", requireAdminRole("tax_daroga", "city_manager", "commissioner"), listImportBatchesHandler);
adminRouter.get("/property-imports/:id", requireAdminRole("tax_daroga", "city_manager", "commissioner"), getImportBatchHandler);
adminRouter.get("/property-imports/:id/holdings/:holdingNo", requireAdminRole("tax_daroga", "city_manager"), getImportHoldingHandler);
adminRouter.post("/property-imports/:id/exclude", requireAdminRole("tax_daroga", "city_manager"), excludeImportHoldingsHandler);
adminRouter.post("/property-imports/:id/restore", requireAdminRole("tax_daroga", "city_manager"), restoreImportHoldingsHandler);
adminRouter.post("/property-imports/:id/review", requireAdminRole("tax_daroga"), reviewImportHoldingsHandler);
adminRouter.post("/property-imports/:id/integrate", requireAdminRole("city_manager"), integrateImportHandler);
adminRouter.post("/property-imports/:id/discard", requireAdminRole("city_manager"), discardImportHandler);
// City Manager: bulk-set the solid waste user charge type to "Residential House" on pending holdings whose floors are all residential.
adminRouter.get("/property-imports/:id/residential-solid-waste", requireAdminRole("city_manager"), previewResidentialSolidWasteHandler);
adminRouter.post("/property-imports/:id/residential-solid-waste", requireAdminRole("city_manager"), applyResidentialSolidWasteHandler);

// Property-wise report (Commissioner/DMC/City Manager): search by
// holding no/owner/address, then full detail + tax pending + change
// log + discrepancy flags + resurvey flags + surveyor field
// verifications for one holding. See propertyReport.controller.ts.
const requirePropertyReportRole = requireAdminRole("commissioner", "deputy_commissioner", "city_manager");
adminRouter.get("/properties/search", requirePropertyReportRole, searchPropertiesHandler);
adminRouter.get("/properties/:holdingNo/report", requirePropertyReportRole, getPropertyReportHandler);

// Shop publication approval - gates a newly-entered shop from public
// visibility until Stall Prabhari, City Manager, and Deputy
// Commissioner have each reviewed it (see SHOP_PUBLICATION_STAGE_ORDER).
const requirePublicationStageRole = requireAdminRole("stall_prabhari", "city_manager", "deputy_commissioner");
adminRouter.get("/shops/pending-publication", requirePublicationStageRole, getShopsPendingPublication);
adminRouter.post("/shops/:shopNo/approve-publication", requirePublicationStageRole, postApproveShopPublication);

// Shop edit approval - an operator's proposed edit to an existing
// shop's own details only takes effect once Stall Prabhari, City
// Manager, and Deputy Commissioner have all approved it, mirroring
// the property/holding edit pattern.
adminRouter.get("/shop-edit-requests", requirePublicationStageRole, getShopEditRequests);
adminRouter.get("/shop-edit-requests/:id", requirePublicationStageRole, getShopEditRequestById);
adminRouter.post("/shop-edit-requests/:id/approve", requirePublicationStageRole, postApproveShopEditRequest);
adminRouter.post("/shop-edit-requests/:id/reject", requirePublicationStageRole, postRejectShopEditRequest);

// Shop agreement document approval - an uploaded (or changed)
// signed-agreement PDF doesn't become the shop's live document until
// it clears the same 3-stage review as shop publication above.
adminRouter.get("/shop-agreement-document-requests", requirePublicationStageRole, listShopAgreementDocumentRequestsHandler);
adminRouter.get("/shop-agreement-document-requests/:id/file", requirePublicationStageRole, getShopAgreementDocumentRequestFile);
adminRouter.post("/shop-agreement-document-requests/:id/approve", requirePublicationStageRole, approveShopAgreementDocumentRequestHandler);
adminRouter.post("/shop-agreement-document-requests/:id/reject", requirePublicationStageRole, rejectShopAgreementDocumentRequestHandler);

// Shop inspection - City Manager or Deputy Commissioner walks a shop
// and records which irregularities (if any) they found, from a fixed
// checklist, plus their own comments.
const requireInspectionRole = requireAdminRole("city_manager", "deputy_commissioner");
adminRouter.get("/shop-inspections", requireInspectionRole, listAllShopInspections);
adminRouter.get("/shops/:shopNo/inspections", requireInspectionRole, listShopInspectionsForShop);
adminRouter.post("/shops/:shopNo/inspections", requireInspectionRole, postCreateShopInspection);

// Migrated holding survey workflow - old paper-record holdings
// bulk-imported under the MUNG-MIG- series. Assignment is split by
// ward parity: Deputy Commissioner handles odd wards, City Manager
// handles even wards, and each verifies only what they themselves
// assigned. See migratedHoldingSurvey.controller.ts.
adminRouter.post("/migrated-holdings/bulk-upload", requireAdminRole("commissioner"), uploadMigratedHoldingsHandler);
adminRouter.get("/migrated-holdings/export", requireAdminRole("commissioner"), exportMigratedHoldingsHandler);
adminRouter.get("/migrated-holdings/pending-assignment", listPendingAssignmentHandler);
adminRouter.get("/tax-darogas", listTaxDarogasHandler);
adminRouter.get("/tax-surveyors", listTaxSurveyorsHandler);

// Tax Collector -> City Manager assignment for cancellation-request
// routing - Commissioner only. See taxCollectorAssignment.controller.ts.
adminRouter.get("/tax-collectors-with-assignment", requireAdminRole("commissioner"), listTaxCollectorsWithAssignmentHandler);
adminRouter.get("/city-managers", requireAdminRole("commissioner"), listCityManagersHandler);
adminRouter.post("/tax-collectors/:username/assign-city-manager", requireAdminRole("commissioner"), assignCityManagerHandler);
adminRouter.post("/tax-collectors/:username/wards", requireAdminRole("commissioner"), setTaxCollectorWardsHandler);
// Agency logins (migration 114). The Project Manager (and senior officers) read collection / distribution / field
// reports; the Team Leader prints ward-wise demand notices for holdings with dues pending.
const requireAgencyReportRole = requireAdminRole("agency_project_manager", "commissioner", "deputy_commissioner", "city_manager", "tax_daroga", "tax_collector", "agency_operator");
adminRouter.get("/agency/report-filters", requireAgencyReportRole, getReportFilterOptionsHandler);
adminRouter.get("/agency/reports", requireAgencyReportRole, getAgencyReportHandler);
adminRouter.get("/agency/reports/export", requireAgencyReportRole, exportAgencyReportHandler);
adminRouter.get("/agency/wards", requireAdminRole("agency_team_leader"), listAgencyWardsHandler);
adminRouter.get("/agency/wards/:ward/holdings", requireAdminRole("agency_team_leader"), listAgencyWardHoldingsHandler);
adminRouter.post("/agency/notices", requireAdminRole("agency_team_leader"), prepareAgencyNoticesHandler);
// Agency Operator (migration 145): prints the ward-wise demand notices NNM has already generated - never creates one.
adminRouter.get("/agency-operator/wards", requireAdminRole("agency_operator"), listAgencyWardsHandler);
adminRouter.get("/agency-operator/wards/:ward/holdings", requireAdminRole("agency_operator"), listAgencyWardHoldingsHandler);
adminRouter.post("/agency-operator/notices", requireAdminRole("agency_operator"), printExistingAgencyNoticesHandler);

// Tax Collector field work (see migration 113 and collectorField.controller.ts): find a house in the MUNG-MIG- data,
// record a house found in neither database, and upload the signed receiving copy of a printed demand notice.
// Viewing is read-only; receiving copies can never be changed or removed.
const requireFieldViewRole = requireAdminRole("tax_collector", "tax_daroga", "city_manager", "deputy_commissioner", "commissioner");
adminRouter.get("/migrated-holdings/search", requireAdminRole("tax_collector"), searchMigratedHoldingsHandler);
adminRouter.post("/unsurveyed-houses", requireAdminRole("tax_collector"), createUnsurveyedHouseHandler);
adminRouter.get("/unsurveyed-houses", requireFieldViewRole, listUnsurveyedHousesHandler);
adminRouter.get("/unsurveyed-houses/:id/photo", requireFieldViewRole, getUnsurveyedHousePhotoHandler);
adminRouter.param("holdingNo", collectorHoldingParam);
adminRouter.param("demandNo", collectorDemandNoticeParam);
adminRouter.get("/receiving-copies/notices/:holdingNo", requireAdminRole("tax_collector"), listNoticesForReceivingHandler);
adminRouter.post("/receiving-copies/notices/:demandNo", requireAdminRole("tax_collector"), uploadReceivingCopyHandler);
adminRouter.get("/receiving-copies", requireFieldViewRole, listReceivingCopiesHandler);
adminRouter.get("/receiving-copies/:id/photo", requireFieldViewRole, getReceivingCopyPhotoHandler);
adminRouter.post("/migrated-holdings/:holdingNo/assign", assignToSurveyorHandler);
adminRouter.get("/migrated-holdings/my-assignments", listMyAssignmentsHandler);
adminRouter.post("/migrated-holdings/:holdingNo/assign-surveyor", assignToTaxSurveyorHandler);
adminRouter.get("/migrated-holdings/my-surveys", listMySurveysHandler);
adminRouter.post("/migrated-holdings/:holdingNo/submit-survey", submitSurveyorEntryHandler);
adminRouter.post("/migrated-holdings/:holdingNo/verify-tax-daroga", verifyByTaxDarogaHandler);
adminRouter.post("/migrated-holdings/:holdingNo/revert", revertToSurveyorHandler);
adminRouter.get("/migrated-holdings/pending-final-verification", listPendingFinalVerificationHandler);
adminRouter.post("/migrated-holdings/:holdingNo/finalize", finalizeVerificationHandler);
adminRouter.get("/migrated-holdings/:holdingNo/events", listEventsForHoldingHandler);

// Property resurvey flags - raised by Tax Collectors during
// collection when a holding's recorded details look different from
// what they found on the ground. Viewable/reviewable by Tax Daroga
// or Commissioner; export restricted to Commissioner, matching the
// migrated-holdings export pattern.
const requireResurveyFlagReviewRole = requireAdminRole("tax_daroga", "commissioner");
adminRouter.get("/property-resurvey-flags", requireResurveyFlagReviewRole, listResurveyFlagsHandler);

// Collection issues oversight - same reviewer roles as resurvey flags.
adminRouter.get("/solid-waste-requests", requireAdminRole("tax_daroga", "city_manager"), listMySolidWasteRequests);
adminRouter.post("/solid-waste-requests/:id/approve", requireAdminRole("tax_daroga", "city_manager"), postApproveSolidWasteRequest);
adminRouter.post("/solid-waste-requests/:id/reject", requireAdminRole("tax_daroga", "city_manager"), postRejectSolidWasteRequest);
// Field collection: the Tax Daroga prints the day's receipts collector-wise; cheque/DD receipts are reconciled by the
// Project Manager and then the Tax Daroga (or marked bounced).
const requireBulkReceiptRole = requireAdminRole("tax_daroga", "commissioner", "deputy_commissioner", "city_manager");
adminRouter.get("/bulk-receipts/collectors", requireBulkReceiptRole, getBulkReceiptCollectors);
adminRouter.get("/bulk-receipts", requireBulkReceiptRole, getBulkReceipts);
adminRouter.get("/instrument-reconciliation", requireAdminRole("agency_project_manager", "tax_daroga", "commissioner", "deputy_commissioner", "city_manager"), getInstruments);
adminRouter.post("/instrument-reconciliation/:receiptNo/pm-verify", requireAdminRole("agency_project_manager"), postPmVerifyInstrument);
adminRouter.post("/instrument-reconciliation/:receiptNo/reconcile", requireAdminRole("tax_daroga"), postReconcileInstrument);
adminRouter.post("/instrument-reconciliation/:receiptNo/bounce", requireAdminRole("agency_project_manager", "tax_daroga"), postBounceInstrument);

// Khatian scans: the Abhilekh Prabhari uploads, the Deputy Municipal Commissioner reviews; senior officers can view.
const requireKhatianViewRole = requireAdminRole("abhilekh_prabhari", "deputy_commissioner", "commissioner", "city_manager");
adminRouter.post("/khatian", requireAdminRole("abhilekh_prabhari"), postKhatian);
adminRouter.get("/khatian", requireKhatianViewRole, getKhatians);
adminRouter.get("/khatian/:id/file", requireKhatianViewRole, getKhatianFile);
adminRouter.get("/khatian/:id/history", requireKhatianViewRole, getKhatianHistory);
adminRouter.post("/khatian/:id/review", requireAdminRole("deputy_commissioner"), postReviewKhatian);

// Online mutation applications: everyone in the mutation chain can open one (and its documents); the Tax Daroga links
// a manually entered one to its holding (or turns it down).
const requireMutationApplicationRole = requireAdminRole("tax_daroga", "tax_surveyor", "mutation_nodal_clerk", "deputy_commissioner", "commissioner", "city_manager");
adminRouter.get("/mutation-applications", requireMutationApplicationRole, getMutationApplications);
adminRouter.get("/mutation-applications/:id", requireMutationApplicationRole, getMutationApplication);
adminRouter.get("/mutation-applications/:id/documents/:docId/file", requireMutationApplicationRole, getMutationApplicationDocument);
adminRouter.post("/mutation-applications/:id/link", requireAdminRole("tax_daroga"), postLinkMutationApplication);
adminRouter.post("/mutation-applications/:id/reject", requireAdminRole("tax_daroga"), postRejectMutationApplication);
adminRouter.post("/mutation-applications/:id/return", requireAdminRole("tax_daroga"), postReturnToApplicant);
adminRouter.get("/holdings/:holdingNo/lineage", requireAdminRole("tax_daroga", "mutation_nodal_clerk", "deputy_commissioner", "commissioner", "city_manager"), getHoldingLineage);

// Online requests for a new holding (property never assessed): Tax Daroga (demand register no. + surveyor) -> Tax
// Surveyor (field report) -> Tax Daroga (comments) -> DMC -> Commissioner (approves; the MMC- holding is created).
// Each step checks the officer's role and the request's status in the service; a Tax Surveyor sees only his own.
const requireNewHoldingRole = requireAdminRole("tax_daroga", "tax_surveyor", "mutation_nodal_clerk", "deputy_commissioner", "commissioner", "city_manager");
adminRouter.get("/new-holding-requests", requireNewHoldingRole, getNewHoldingRequests);
adminRouter.get("/new-holding-requests/pending-count", requireNewHoldingRole, getNewHoldingPendingCount);
adminRouter.get("/new-holding-requests/:id", requireNewHoldingRole, getNewHoldingRequest);
adminRouter.get("/new-holding-requests/:id/documents/:docId/file", requireNewHoldingRole, getNewHoldingRequestDocument);
adminRouter.post("/new-holding-requests/:id/assign", requireAdminRole("tax_daroga"), postNewHoldingAssign);
adminRouter.post("/new-holding-requests/:id/field-report", requireAdminRole("tax_surveyor"), postNewHoldingFieldReport);
adminRouter.post("/new-holding-requests/:id/daroga-forward", requireAdminRole("tax_daroga"), postNewHoldingDarogaForward);
adminRouter.post("/new-holding-requests/:id/dmc-forward", requireAdminRole("deputy_commissioner"), postNewHoldingDmcForward);
adminRouter.post("/new-holding-requests/:id/send-back", requireAdminRole("deputy_commissioner", "commissioner"), postNewHoldingSendBack);
adminRouter.post("/new-holding-requests/:id/approve", requireAdminRole("commissioner"), postNewHoldingApprove);
adminRouter.post("/new-holding-requests/:id/return", requireAdminRole("tax_daroga"), postNewHoldingReturn);
adminRouter.post("/new-holding-requests/:id/reject", requireAdminRole("tax_daroga", "deputy_commissioner", "commissioner"), postNewHoldingReject);

// Trade licence field survey: the Tax Collector records visits and prints the notices; the City Manager (who signs them)
// and senior officers see every business and its notice status.
// (GET routes only - the Agency Operator may view, never act.)
const requireTlViewRole = requireAdminRole("tax_collector", "city_manager", "deputy_commissioner", "commissioner", "trade_license_nodal", "agency_operator");
adminRouter.post("/tl-survey", requireAdminRole("tax_collector"), postTlSurvey);
adminRouter.get("/tl-surveys", requireTlViewRole, getTlSurveys);
adminRouter.get("/tl-surveys/:id/file/:which", requireTlViewRole, getTlSurveyFile);
adminRouter.post("/tl-surveys/:id/complied", requireAdminRole("tax_collector", "city_manager"), postTlComplied);
adminRouter.get("/tl-notices/print-queue", requireAdminRole("tax_collector"), getTlPrintQueue);
adminRouter.post("/tl-notices/mark-printed", requireAdminRole("tax_collector"), postTlMarkPrinted);
adminRouter.get("/tl-notices/:id", requireTlViewRole, getTlNotice);

adminRouter.get("/collection-issues/mine", requireAdminRole("tax_collector"), listMyCollectionIssues);
adminRouter.get("/collection-issues", requireAdminRole("tax_daroga", "commissioner", "city_manager"), listAllCollectionIssues);
adminRouter.post("/collection-issues/:id/generate-notice", requireAdminRole("city_manager"), postGenerateCollectionIssueNotice);
adminRouter.get("/collection-issues/:id/notices", requireAdminRole("tax_daroga", "commissioner", "city_manager"), getCollectionIssueNotices);
adminRouter.get("/collection-issue-notices/:id/reprint", requireAdminRole("tax_collector", "tax_daroga", "commissioner", "deputy_commissioner", "city_manager"), getReprintCollectionIssueNotice);
adminRouter.post("/property-resurvey-flags/:id/review", requireResurveyFlagReviewRole, reviewResurveyFlagHandler);
adminRouter.get("/property-resurvey-flags/export", requireAdminRole("commissioner"), exportResurveyFlagsHandler);


// Demand notice cancel/supersede and receipt cancel - a separate,
// FIXED 2-stage chain (Stall Prabhari, then City Manager only - no
// Deputy Commissioner, unlike the 3-stage publication/edit chains
// above), since this specific approval was asked for as exactly those
// two roles.
const requireDemandActionStageRole = requireAdminRole("stall_prabhari", "city_manager");
adminRouter.get("/shop-demand-actions", requireDemandActionStageRole, getDemandActionRequests);
adminRouter.get("/shop-demand-actions/:id", requireDemandActionStageRole, getDemandActionRequestById);
adminRouter.post("/shop-demand-actions/:id/approve", requireDemandActionStageRole, postApproveDemandAction);
adminRouter.post("/shop-demand-actions/:id/reject", requireDemandActionStageRole, postRejectDemandAction);
adminRouter.get("/shops/per-sqft-report", getPerSqftReport);
adminRouter.post("/violation-notices/:id/resolve", postResolveViolationNotice);

// Shop rental applications (new tenant applications for vacant shops)
adminRouter.get("/shop-rental-applications", getRentalApplications);
adminRouter.get("/shop-rental-applications/:id", getRentalApplicationById);
adminRouter.post("/shop-rental-applications/:id/approve", postApproveRentalApplication);
adminRouter.post("/shop-rental-applications/:id/reject", postRejectRentalApplication);

// Shop rental preferences (market/size/bid intake, before a specific shop is picked)
// - /matching must come before /:id, or Express would treat "matching" as an id.
adminRouter.get("/shop-rental-preferences", getRentalPreferences);
adminRouter.get("/shop-rental-preferences/matching", getPreferencesMatchingShop);
adminRouter.get("/shop-rental-preferences/:id", getRentalPreferenceById);
adminRouter.post("/shop-rental-preferences/:id/allot", postAllotPreference);
adminRouter.post("/shop-rental-preferences/:id/reject", postRejectRentalPreference);

// Trade license applications (new + renewal) — /stats MUST come before
// /:id below, or Express would try to parse "stats" as an id.
// Restricted from Stall Prabhari - trade licenses aren't part of the
// shop/rental workflow that role is scoped to.
// The Agency Operator may read the list and the details (ID numbers masked) - not the documents, not approve/reject.
const requireTlApplicationRead = requireAdminRole("tax_daroga", "mutation_nodal_clerk", "deputy_commissioner", "commissioner", "city_manager", "trade_license_nodal", "agency_operator");
adminRouter.get("/trade-license-applications/stats", requireTlApplicationRead, getTradeLicenseStats);
adminRouter.get("/trade-license-applications", requireTlApplicationRead, getTradeLicenseApplications);
adminRouter.get("/trade-license-applications/:id", requireTlApplicationRead, getTradeLicenseApplicationById);
adminRouter.get("/trade-license-applications/:id/documents/:docId", requireNonStallPrabhari, getTradeLicenseDocumentFile);
adminRouter.post("/trade-license-applications/:id/approve", requireNonStallPrabhari, postApproveTradeLicenseApplication);
adminRouter.post("/trade-license-applications/:id/reject", requireNonStallPrabhari, postRejectTradeLicenseApplication);

// Pre-2011 ARV from the old demand register (migration 146): Tax Daroga enters, City Manager approves.
const requirePre2011View = requireAdminRole("tax_daroga", "city_manager", "deputy_commissioner", "commissioner");
adminRouter.get("/pre2011-arv/worklist", requirePre2011View, getPre2011Worklist);
adminRouter.get("/pre2011-arv/holding/:holdingNo", requirePre2011View, getPre2011Holding);
adminRouter.get("/pre2011-arv/entries", requirePre2011View, getPre2011Entries);
adminRouter.get("/pre2011-arv/pending-count", requirePre2011View, getPre2011PendingCount);
adminRouter.post("/pre2011-arv/entries", requireAdminRole("tax_daroga"), postPre2011Entry);
adminRouter.post("/pre2011-arv/entries/:id/approve", requireAdminRole("city_manager"), postPre2011Approve);
adminRouter.post("/pre2011-arv/entries/:id/reject", requireAdminRole("city_manager"), postPre2011Reject);

// Bulk demand notice generation
adminRouter.post("/demand-notices/bulk-generate", requireSeniorAdmin, postBulkGenerateDemandNotices);
adminRouter.get("/demand-notices/refresh-runs", requireSeniorAdmin, getDemandRefreshRuns);

// Bulk tax-history-stage regeneration (backfill from current Floors)
adminRouter.post("/tax-history/bulk-regenerate", requireSeniorAdmin, postBulkRegenerateTaxHistory);

// Data export - GET /api/v1/admin/export?dataset=properties|payments|notices|changes|all
adminRouter.get("/export", requireSeniorAdmin, getDataExport);


// Assistant Town Planning Supervisor (ATPS) and Commissioner
// capture/edit coordinates and manage KML imports. Assistant
// Architect is view-only (the GIS map) - added to search/view/export
// endpoints but deliberately left off anything that writes data.
const requireGeoEditRole = requireAdminRole("assistant_town_planning_supervisor", "commissioner");
const requireGeoViewRole = requireAdminRole("assistant_town_planning_supervisor", "commissioner", "assistant_architect");
adminRouter.get("/geo/properties/search", requireGeoViewRole, searchPropertiesForGeo);
adminRouter.get("/geo/properties/all", requireGeoViewRole, listAllPropertyGeoHandler);
adminRouter.get("/geo/properties/:holdingNo", requireGeoViewRole, getPropertyGeo);
adminRouter.put("/geo/properties/:holdingNo", requireGeoEditRole, putPropertyGeo);
adminRouter.get("/geo/progress", requireGeoViewRole, getGeoProgress);
adminRouter.get("/geo/infrastructure-lines", requireGeoViewRole, listInfrastructureLinesHandler);
adminRouter.post("/geo/infrastructure-lines", requireGeoEditRole, createInfrastructureLineHandler);
adminRouter.post("/geo/infrastructure-lines/import-kml", requireGeoEditRole, importInfrastructureLinesKmlHandler);
adminRouter.put("/geo/infrastructure-lines/:id", requireGeoEditRole, updateInfrastructureLineHandler);
adminRouter.delete("/geo/infrastructure-lines/:id", requireGeoEditRole, deleteInfrastructureLineHandler);
adminRouter.get("/geo/ward-boundaries", requireGeoViewRole, listWardBoundariesHandler);
adminRouter.post("/geo/ward-boundaries/import-kml", requireGeoEditRole, importWardBoundariesKmlHandler);
adminRouter.delete("/geo/ward-boundaries/:id", requireGeoEditRole, deleteWardBoundaryHandler);
adminRouter.get("/geo/export", requireGeoViewRole, exportGeoData);