"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2, Plus, Trash2, ClipboardList } from "lucide-react";
import { AttendanceHeader } from "@/components/attendance/attendance-header";
import { AssetPhotoSection } from "@/components/attendance/asset-photo-section";
import { useAttendanceGuard } from "@/lib/use-attendance-guard";
import {
  fetchAllAssets,
  createAsset,
  fetchFleetRegistry,
  submitBaselineSurvey,
  fetchBaselineSurvey,
  type AssetSummary,
  type FleetRegistry,
  type FleetFieldDef,
  type FleetDefectInput,
} from "@/lib/attendance-api";

const FLEET_EDIT_ROLES = ["attendance_admin", "junior_engineer", "assistant_engineer_mechanical", "maintenance_nodal_clerk"];

const inputClass = "w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1";
const labelClass = "mb-1 block text-xs font-medium text-slate-600";
const sectionClass = "rounded-xl border border-slate-200 bg-white p-5";
const sectionTitleClass = "mb-3 text-sm font-semibold text-slate-800";

type Draft = Record<string, unknown>;

/**
 * The JE-led fleet baseline survey - one comprehensive "opening
 * entry" per asset covering identification, asset-type-specific
 * technical fields (dynamically shown per the field registry),
 * condition/safety/AMC assessment, utilisation, and the defect
 * register - all submitted together in one sitting, matching how
 * this is actually filled out in the field.
 */
function BaselineSurveyPageInner() {
  const attendanceUser = useAttendanceGuard(FLEET_EDIT_ROLES as never);
  const searchParams = useSearchParams();

  const [registry, setRegistry] = useState<FleetRegistry | null>(null);
  const [assets, setAssets] = useState<AssetSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingAsset, setLoadingAsset] = useState(false);

  // Which asset we're surveying - either picked from the existing
  // list or freshly created via the "Add New Vehicle" flow below.
  const [selectedAssetId, setSelectedAssetId] = useState<number | null>(null);
  const [showNewAssetForm, setShowNewAssetForm] = useState(false);
  const [newAssetLabel, setNewAssetLabel] = useState("");
  const [newAssetType, setNewAssetType] = useState<"vehicle" | "tricycle" | "hand_cart">("vehicle");
  const [creatingAsset, setCreatingAsset] = useState(false);

  const [draft, setDraft] = useState<Draft>({});
  const [componentCondition, setComponentCondition] = useState<Record<string, number>>({});
  const [defects, setDefects] = useState<FleetDefectInput[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  function update(key: string, value: unknown) {
    setDraft((d) => ({ ...d, [key]: value }));
  }
  function updateTechnical(key: string, value: unknown) {
    setDraft((d) => ({ ...d, technicalData: { ...((d.technicalData as Record<string, unknown>) ?? {}), [key]: value } }));
  }

  useEffect(() => {
    if (!attendanceUser) return;
    fetchFleetRegistry()
      .then(setRegistry)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load the field registry."));
    fetchAllAssets()
      .then(setAssets)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load the asset list."));
  }, [attendanceUser]);

  async function handleCreateAsset() {
    if (!newAssetLabel.trim()) return;
    setCreatingAsset(true);
    setError(null);
    try {
      const asset = await createAsset({ assetType: newAssetType, label: newAssetLabel.trim(), vehicleNumber: null, chassisNumber: null });
      setAssets((prev) => (prev ? [...prev, asset] : [asset]));
      setSelectedAssetId(asset.id);
      setShowNewAssetForm(false);
      setNewAssetLabel("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create this asset.");
    } finally {
      setCreatingAsset(false);
    }
  }

  async function handleSelectAsset(id: number) {
    setSelectedAssetId(id);
    setSubmitted(false);
    setDraft({});
    setComponentCondition({});
    setDefects([]);
    setError(null);
    setLoadingAsset(true);
    try {
      const { asset, latestSurvey } = await fetchBaselineSurvey(id);
      setDraft({
        assetCategory: asset.asset_category ?? "",
        assetTypeDetail: asset.asset_type_detail ?? "",
        excavatorClass: asset.excavator_class ?? "",
        registrationNumber: asset.registration_number ?? "",
        engineNumber: asset.engine_number ?? "",
        manufacturer: asset.manufacturer ?? "",
        model: asset.model ?? "",
        variant: asset.variant ?? "",
        yearOfManufacture: asset.year_of_manufacture ?? "",
        dateOfPurchase: asset.date_of_purchase?.slice(0, 10) ?? "",
        dateOfCommissioning: asset.date_of_commissioning?.slice(0, 10) ?? "",
        ownershipStatus: asset.ownership_status ?? "",
        owner: asset.owner ?? "",
        currentServiceProvider: asset.current_service_provider ?? "",
        presentLocationYard: asset.present_location_yard ?? "",
        departmentSection: asset.department_section ?? "",
        assignedWardZone: asset.assigned_ward_zone ?? "",
        fuelEnergyType: asset.fuel_energy_type ?? "",
        operatingWeight: asset.operating_weight ?? "",
        technicalData: asset.technical_data ?? {},
        meterType: asset.meter_type ?? "",
        meterFunctional: asset.meter_functional ?? undefined,
        currentReadingDate: asset.current_reading_date?.slice(0, 10) ?? "",
        currentReadingVerifiedBy: asset.current_reading_verified_by ?? "",
        overallStatus: latestSurvey?.overall_status ?? "",
        safetyStatus: latestSurvey?.safety_status ?? "",
        amcDisposition: latestSurvey?.amc_disposition ?? "",
        deploymentStatus: latestSurvey?.deployment_status ?? "",
        utilisationDataSource: latestSurvey?.utilisation_data_source ?? "",
        utilisationData: latestSurvey?.utilisation_data ?? {},
        surveyNotes: "",
      });
      setComponentCondition(latestSurvey?.component_condition ?? {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load this asset's details.");
    } finally {
      setLoadingAsset(false);
    }
  }

  // Deep-link support - e.g. arriving from the fleet survey summary
  // page's "Update"/"Survey now" links (?assetId=5). Waits for the
  // asset list to load first so the dropdown reflects the selection
  // correctly, and only fires once.
  useEffect(() => {
    const assetIdParam = searchParams.get("assetId");
    if (!assetIdParam || !assets || selectedAssetId !== null) return;
    const id = Number(assetIdParam);
    if (assets.some((a) => a.id === id)) handleSelectAsset(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets, searchParams]);

  if (!attendanceUser) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  const assetTypeOptions = registry && draft.assetCategory ? registry.assetTypesByCategory[draft.assetCategory as string] ?? [] : [];
  const technicalModuleKeys = registry && draft.assetTypeDetail ? registry.technicalModulesByAssetType[draft.assetTypeDetail as string] ?? [] : [];

  return (
    <div className="min-h-screen bg-slate-50">
      <AttendanceHeader user={attendanceUser} />

      <main className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <ClipboardList className="h-6 w-6" />
          Fleet Baseline Survey
        </h1>
        <p className="mb-6 text-sm text-slate-500">
          The comprehensive opening entry for each vehicle/equipment logbook - identification, condition, defects, and AMC
          assessment in one survey.
        </p>

        {error && (
          <div role="alert" className="mb-5 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <section className={`${sectionClass} mb-6`}>
          <h2 className={sectionTitleClass}>Select or Add a Vehicle/Asset</h2>
          <div className="flex items-center gap-2">
            <select
              value={selectedAssetId ?? ""}
              onChange={(e) => e.target.value && handleSelectAsset(Number(e.target.value))}
              className={inputClass}
            >
              <option value="">- Select an existing asset -</option>
              {assets?.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label} {a.vehicleNumber ? `(${a.vehicleNumber})` : ""} {a.driverName ? `- Driver: ${a.driverName}` : ""}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setShowNewAssetForm((v) => !v)}
              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-nnm-blue px-3 py-2 text-xs font-semibold text-nnm-blue hover:bg-blue-50"
            >
              <Plus className="h-3.5 w-3.5" />
              New Vehicle
            </button>
          </div>

          {showNewAssetForm && (
            <div className="mt-3 flex items-end gap-2 rounded-md border border-slate-200 bg-slate-50 p-3">
              <div className="flex-1">
                <label className={labelClass}>Label / name for this asset</label>
                <input value={newAssetLabel} onChange={(e) => setNewAssetLabel(e.target.value)} placeholder="e.g. Mini Tipper - Ward 12" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Type</label>
                <select value={newAssetType} onChange={(e) => setNewAssetType(e.target.value as typeof newAssetType)} className={inputClass}>
                  <option value="vehicle">Vehicle</option>
                  <option value="tricycle">Tricycle</option>
                  <option value="hand_cart">Hand Cart</option>
                </select>
              </div>
              <button
                type="button"
                onClick={handleCreateAsset}
                disabled={creatingAsset || !newAssetLabel.trim()}
                className="rounded-md bg-nnm-blue px-4 py-2 text-xs font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
              >
                {creatingAsset ? "Creating…" : "Create"}
              </button>
            </div>
          )}
        </section>

        {loadingAsset && (
          <div className="flex items-center gap-2 py-8 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        )}

        {selectedAssetId && !loadingAsset && registry && (
          <div className="space-y-6">
            {submitted && (
              <div role="status" className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                Baseline survey saved.
              </div>
            )}

            <section className={sectionClass}>
              <h2 className={sectionTitleClass}>Identification &amp; Ownership</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Asset Category</label>
                  <select
                    value={(draft.assetCategory as string) ?? ""}
                    onChange={(e) => {
                      update("assetCategory", e.target.value);
                      update("assetTypeDetail", "");
                    }}
                    className={inputClass}
                  >
                    <option value="">- Select -</option>
                    {registry.assetCategories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Asset Type</label>
                  <select
                    value={(draft.assetTypeDetail as string) ?? ""}
                    onChange={(e) => update("assetTypeDetail", e.target.value)}
                    disabled={!draft.assetCategory}
                    className={inputClass}
                  >
                    <option value="">- Select -</option>
                    {assetTypeOptions.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                {draft.assetTypeDetail === "Hydraulic Excavator" && (
                  <div>
                    <label className={labelClass}>Excavator Class</label>
                    <select value={(draft.excavatorClass as string) ?? ""} onChange={(e) => update("excavatorClass", e.target.value)} className={inputClass}>
                      <option value="">- Select -</option>
                      {registry.excavatorClasses.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className={labelClass}>Registration number</label>
                  <input value={(draft.registrationNumber as string) ?? ""} onChange={(e) => update("registrationNumber", e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Engine number</label>
                  <input value={(draft.engineNumber as string) ?? ""} onChange={(e) => update("engineNumber", e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Manufacturer</label>
                  <input value={(draft.manufacturer as string) ?? ""} onChange={(e) => update("manufacturer", e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Model</label>
                  <input value={(draft.model as string) ?? ""} onChange={(e) => update("model", e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Variant</label>
                  <input value={(draft.variant as string) ?? ""} onChange={(e) => update("variant", e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Year of manufacture</label>
                  <input type="number" value={(draft.yearOfManufacture as string) ?? ""} onChange={(e) => update("yearOfManufacture", e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Date of purchase</label>
                  <input type="date" value={(draft.dateOfPurchase as string) ?? ""} onChange={(e) => update("dateOfPurchase", e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Date of commissioning</label>
                  <input type="date" value={(draft.dateOfCommissioning as string) ?? ""} onChange={(e) => update("dateOfCommissioning", e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Ownership status</label>
                  <select value={(draft.ownershipStatus as string) ?? ""} onChange={(e) => update("ownershipStatus", e.target.value)} className={inputClass}>
                    <option value="">- Select -</option>
                    {registry.ownershipStatusOptions.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Owner</label>
                  <input value={(draft.owner as string) ?? ""} onChange={(e) => update("owner", e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Current service provider (optional)</label>
                  <input value={(draft.currentServiceProvider as string) ?? ""} onChange={(e) => update("currentServiceProvider", e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Present location/yard</label>
                  <input value={(draft.presentLocationYard as string) ?? ""} onChange={(e) => update("presentLocationYard", e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Department/section</label>
                  <input value={(draft.departmentSection as string) ?? ""} onChange={(e) => update("departmentSection", e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Assigned ward/zone</label>
                  <input value={(draft.assignedWardZone as string) ?? ""} onChange={(e) => update("assignedWardZone", e.target.value)} className={inputClass} />
                </div>
              </div>
            </section>

            <section className={sectionClass}>
              <h2 className={sectionTitleClass}>Photographs &amp; Evidence</h2>
              <AssetPhotoSection assetId={selectedAssetId} />
            </section>

            <section className={sectionClass}>
              <h2 className={sectionTitleClass}>Common Technical Information</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Fuel/Energy type</label>
                  <input value={(draft.fuelEnergyType as string) ?? ""} onChange={(e) => update("fuelEnergyType", e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Operating weight (kg)</label>
                  <input type="number" value={(draft.operatingWeight as string) ?? ""} onChange={(e) => update("operatingWeight", e.target.value)} className={inputClass} />
                </div>
              </div>
            </section>

            {technicalModuleKeys.map((moduleKey) => {
              const mod = registry.technicalModules[moduleKey];
              if (!mod) return null;
              const technicalData = (draft.technicalData as Record<string, unknown>) ?? {};
              return (
                <section key={moduleKey} className={sectionClass}>
                  <h2 className={sectionTitleClass}>{mod.label}</h2>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {mod.fields.map((f) => (
                      <TechnicalField key={f.key} field={f} value={technicalData[f.key]} onChange={(v) => updateTechnical(f.key, v)} />
                    ))}
                  </div>
                  {mod.subsections?.map((sub) => (
                    <div key={sub.key} className="mt-4 border-t border-slate-100 pt-4">
                      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">{sub.label}</h3>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        {sub.fields.map((f) => (
                          <TechnicalField key={f.key} field={f} value={technicalData[f.key]} onChange={(v) => updateTechnical(f.key, v)} />
                        ))}
                      </div>
                    </div>
                  ))}
                </section>
              );
            })}

            <section className={sectionClass}>
              <h2 className={sectionTitleClass}>Current Meter Readings</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Meter type</label>
                  <select value={(draft.meterType as string) ?? ""} onChange={(e) => update("meterType", e.target.value)} className={inputClass}>
                    <option value="">- Select -</option>
                    {registry.meterTypeOptions.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Meter functional?</label>
                  <select
                    value={draft.meterFunctional === true ? "yes" : draft.meterFunctional === false ? "no" : ""}
                    onChange={(e) => update("meterFunctional", e.target.value === "" ? undefined : e.target.value === "yes")}
                    className={inputClass}
                  >
                    <option value="">- Select -</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Reading date</label>
                  <input type="date" value={(draft.currentReadingDate as string) ?? ""} onChange={(e) => update("currentReadingDate", e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Reading verified by</label>
                  <input value={(draft.currentReadingVerifiedBy as string) ?? ""} onChange={(e) => update("currentReadingVerifiedBy", e.target.value)} className={inputClass} />
                </div>
              </div>
            </section>

            <section className={sectionClass}>
              <h2 className={sectionTitleClass}>Component Condition</h2>
              {registry.conditionComponentGroups.map((g) => (
                <div key={g.group} className="mb-4 last:mb-0">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{g.group}</h3>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {g.components.map((c) => (
                      <div key={c}>
                        <label className={labelClass}>{c}</label>
                        <select
                          value={componentCondition[c] ?? ""}
                          onChange={(e) => setComponentCondition((prev) => ({ ...prev, [c]: Number(e.target.value) }))}
                          className={inputClass}
                        >
                          <option value="">- N/A -</option>
                          {registry.conditionScale.map((s) => (
                            <option key={s.value} value={s.value}>
                              {s.value} - {s.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </section>

            <section className={sectionClass}>
              <h2 className={sectionTitleClass}>Overall Status, Safety &amp; AMC Assessment</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Overall Asset Status</label>
                  <select value={(draft.overallStatus as string) ?? ""} onChange={(e) => update("overallStatus", e.target.value)} className={inputClass}>
                    <option value="">- Select -</option>
                    {registry.overallStatusOptions.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Safety Status</label>
                  <select value={(draft.safetyStatus as string) ?? ""} onChange={(e) => update("safetyStatus", e.target.value)} className={inputClass}>
                    <option value="">- Select -</option>
                    {registry.safetyStatusOptions.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>AMC/CMC Disposition</label>
                  <select value={(draft.amcDisposition as string) ?? ""} onChange={(e) => update("amcDisposition", e.target.value)} className={inputClass}>
                    <option value="">- Select -</option>
                    {registry.amcDispositionOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.value} - {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Deployment Status</label>
                  <select value={(draft.deploymentStatus as string) ?? ""} onChange={(e) => update("deploymentStatus", e.target.value)} className={inputClass}>
                    <option value="">- Select -</option>
                    {registry.deploymentStatusOptions.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </section>

            <section className={sectionClass}>
              <h2 className={sectionTitleClass}>Utilisation &amp; Operations</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {[
                  ["avgKmDay", "Average km/day"],
                  ["avgKmMonth", "Average km/month"],
                  ["avgOperatingHoursDay", "Average operating hours/day"],
                  ["avgOperatingDaysMonth", "Average operating days/month"],
                  ["avgTripsDay", "Average trips/day"],
                  ["avgLoadPerTrip", "Average load/trip"],
                  ["avgTonnesDay", "Approx. tonnes handled/day"],
                  ["breakdownsLast12Months", "Breakdowns - last 12 months"],
                  ["totalBreakdownDowntime", "Total breakdown downtime"],
                  ["avgBreakdownDuration", "Average breakdown duration"],
                  ["accidentIncidentsLast12Months", "Accident incidents - last 12 months"],
                ].map(([key, label]) => {
                  const util = (draft.utilisationData as Record<string, unknown>) ?? {};
                  return (
                    <div key={key}>
                      <label className={labelClass}>{label}</label>
                      <input
                        value={(util[key] as string) ?? ""}
                        onChange={(e) => update("utilisationData", { ...util, [key]: e.target.value })}
                        className={inputClass}
                      />
                    </div>
                  );
                })}
                <div>
                  <label className={labelClass}>Source of utilisation data</label>
                  <select value={(draft.utilisationDataSource as string) ?? ""} onChange={(e) => update("utilisationDataSource", e.target.value)} className={inputClass}>
                    <option value="">- Select -</option>
                    {registry.utilisationDataSourceOptions.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </section>

            <section className={sectionClass}>
              <div className="mb-3 flex items-center justify-between">
                <h2 className={sectionTitleClass}>Defect &amp; Repair Register</h2>
                <button
                  type="button"
                  onClick={() =>
                    setDefects((d) => [...d, { component: "", description: "", severity: "Minor", safetyCritical: false }])
                  }
                  className="inline-flex items-center gap-1 rounded-md border border-nnm-blue px-2.5 py-1.5 text-xs font-semibold text-nnm-blue hover:bg-blue-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Defect
                </button>
              </div>
              {defects.length === 0 ? (
                <p className="text-xs text-slate-400">No defects recorded.</p>
              ) : (
                <div className="space-y-4">
                  {defects.map((d, i) => (
                    <div key={i} className="rounded-md border border-slate-200 p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-500">Defect #{i + 1}</span>
                        <button type="button" onClick={() => setDefects((prev) => prev.filter((_, idx) => idx !== i))} className="text-red-500 hover:text-red-700">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label className={labelClass}>Component</label>
                          <input
                            value={d.component}
                            onChange={(e) => setDefects((prev) => prev.map((x, idx) => (idx === i ? { ...x, component: e.target.value } : x)))}
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className={labelClass}>Severity</label>
                          <select
                            value={d.severity}
                            onChange={(e) => setDefects((prev) => prev.map((x, idx) => (idx === i ? { ...x, severity: e.target.value as FleetDefectInput["severity"] } : x)))}
                            className={inputClass}
                          >
                            {registry.defectSeverityOptions.map((o) => (
                              <option key={o} value={o}>
                                {o}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="sm:col-span-2">
                          <label className={labelClass}>Description</label>
                          <textarea
                            value={d.description}
                            onChange={(e) => setDefects((prev) => prev.map((x, idx) => (idx === i ? { ...x, description: e.target.value } : x)))}
                            className={inputClass}
                            rows={2}
                          />
                        </div>
                        <div>
                          <label className={labelClass}>Repair priority</label>
                          <select
                            value={d.repairPriority ?? ""}
                            onChange={(e) => setDefects((prev) => prev.map((x, idx) => (idx === i ? { ...x, repairPriority: e.target.value } : x)))}
                            className={inputClass}
                          >
                            <option value="">- Select -</option>
                            {registry.defectPriorityOptions.map((o) => (
                              <option key={o} value={o}>
                                {o}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className={labelClass}>Estimated repair cost (₹)</label>
                          <input
                            type="number"
                            value={d.estimatedRepairCost ?? ""}
                            onChange={(e) => setDefects((prev) => prev.map((x, idx) => (idx === i ? { ...x, estimatedRepairCost: Number(e.target.value) } : x)))}
                            className={inputClass}
                          />
                        </div>
                        <div className="flex items-center gap-2 sm:col-span-2">
                          <input
                            type="checkbox"
                            checked={d.safetyCritical ?? false}
                            onChange={(e) => setDefects((prev) => prev.map((x, idx) => (idx === i ? { ...x, safetyCritical: e.target.checked } : x)))}
                            className="h-4 w-4 rounded border-slate-300"
                          />
                          <label className="text-xs text-slate-600">Safety critical</label>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <SubmitSurveyButton
              assetId={selectedAssetId}
              draft={draft}
              componentCondition={componentCondition}
              defects={defects}
              onSubmitting={setSubmitting}
              onError={setError}
              onSubmitted={() => setSubmitted(true)}
              submitting={submitting}
            />
          </div>
        )}
      </main>
    </div>
  );
}

/** Renders one technical-module field, dispatching on its type - boolean/select/multiselect get a dropdown, everything else a plain text/number input. */
function TechnicalField({ field, value, onChange }: { field: FleetFieldDef; value: unknown; onChange: (v: unknown) => void }) {
  return (
    <div>
      <label className={labelClass}>
        {field.label}
        {field.unit ? ` (${field.unit})` : ""}
      </label>
      {field.type === "boolean" ? (
        <select
          value={value === true ? "yes" : value === false ? "no" : ""}
          onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value === "yes")}
          className={inputClass}
        >
          <option value="">- Select -</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      ) : field.type === "select" ? (
        <select value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value === "" ? undefined : e.target.value)} className={inputClass}>
          <option value="">- Select -</option>
          {field.options?.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : field.type === "multiselect" ? (
        <div className="flex flex-wrap gap-2">
          {field.options?.map((o) => {
            const selected = Array.isArray(value) && (value as string[]).includes(o);
            return (
              <button
                key={o}
                type="button"
                onClick={() => {
                  const current = Array.isArray(value) ? (value as string[]) : [];
                  onChange(selected ? current.filter((x) => x !== o) : [...current, o]);
                }}
                className={`rounded-full border px-3 py-1 text-xs ${selected ? "border-nnm-blue bg-blue-50 text-nnm-blue" : "border-slate-300 text-slate-600"}`}
              >
                {o}
              </button>
            );
          })}
        </div>
      ) : (
        <input
          type={field.type === "number" ? "number" : "text"}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(field.type === "number" ? (e.target.value === "" ? undefined : Number(e.target.value)) : e.target.value)}
          className={inputClass}
        />
      )}
    </div>
  );
}

function SubmitSurveyButton({
  assetId,
  draft,
  componentCondition,
  defects,
  submitting,
  onSubmitting,
  onError,
  onSubmitted,
}: {
  assetId: number;
  draft: Draft;
  componentCondition: Record<string, number>;
  defects: FleetDefectInput[];
  submitting: boolean;
  onSubmitting: (v: boolean) => void;
  onError: (v: string | null) => void;
  onSubmitted: () => void;
}) {
  async function handleSubmit() {
    if (!draft.assetCategory || !draft.assetTypeDetail) {
      onError("Asset Category and Asset Type are required.");
      return;
    }
    onError(null);
    onSubmitting(true);
    try {
      await submitBaselineSurvey(assetId, {
        assetCategory: draft.assetCategory as string,
        assetTypeDetail: draft.assetTypeDetail as string,
        excavatorClass: (draft.excavatorClass as string) || null,
        registrationNumber: (draft.registrationNumber as string) || null,
        engineNumber: (draft.engineNumber as string) || null,
        manufacturer: (draft.manufacturer as string) || null,
        model: (draft.model as string) || null,
        variant: (draft.variant as string) || null,
        yearOfManufacture: draft.yearOfManufacture ? Number(draft.yearOfManufacture) : null,
        dateOfPurchase: (draft.dateOfPurchase as string) || null,
        dateOfCommissioning: (draft.dateOfCommissioning as string) || null,
        ownershipStatus: (draft.ownershipStatus as string) || null,
        owner: (draft.owner as string) || null,
        currentServiceProvider: (draft.currentServiceProvider as string) || null,
        presentLocationYard: (draft.presentLocationYard as string) || null,
        departmentSection: (draft.departmentSection as string) || null,
        assignedWardZone: (draft.assignedWardZone as string) || null,
        fuelEnergyType: (draft.fuelEnergyType as string) || null,
        operatingWeight: draft.operatingWeight ? Number(draft.operatingWeight) : null,
        technicalData: (draft.technicalData as Record<string, unknown>) ?? {},
        meterType: (draft.meterType as string) || null,
        meterFunctional: draft.meterFunctional as boolean | undefined,
        currentReadingDate: (draft.currentReadingDate as string) || null,
        currentReadingVerifiedBy: (draft.currentReadingVerifiedBy as string) || null,
        componentCondition,
        overallStatus: (draft.overallStatus as string) || null,
        safetyStatus: (draft.safetyStatus as string) || null,
        amcDisposition: (draft.amcDisposition as string) || null,
        deploymentStatus: (draft.deploymentStatus as string) || null,
        utilisationData: (draft.utilisationData as Record<string, unknown>) ?? {},
        utilisationDataSource: (draft.utilisationDataSource as string) || null,
        defects: defects.filter((d) => d.component.trim() && d.description.trim()),
      });
      onSubmitted();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not save this baseline survey.");
    } finally {
      onSubmitting(false);
    }
  }

  return (
    <button
      onClick={handleSubmit}
      disabled={submitting}
      className="w-full rounded-md bg-nnm-blue px-4 py-3 text-sm font-semibold text-white hover:bg-nnm-blue-dark disabled:opacity-60"
    >
      {submitting ? "Saving…" : "Save Baseline Survey"}
    </button>
  );
}

export default function BaselineSurveyPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>}>
      <BaselineSurveyPageInner />
    </Suspense>
  );
}
