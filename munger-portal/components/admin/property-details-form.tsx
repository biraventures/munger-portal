"use client";

import { Plus } from "lucide-react";
import { FloorRow, makeBlankFloor, type FloorFormState } from "@/components/operator/floor-row";

const inputClass = "w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-nnm-blue focus:ring-offset-1";
const labelClass = "mb-1.5 block text-sm font-medium text-slate-700";

export interface AdminPropertyFormState {
  ownerName: string;
  areaSqft: string;
  address: string;
  ward: string;
  assessmentYear: string;
  roadType: "PMR" | "MR" | "OR";
  holdingCreationYear: string;
  floors: FloorFormState[];
}

export function blankAdminPropertyForm(): AdminPropertyFormState {
  return {
    ownerName: "",
    areaSqft: "",
    address: "",
    ward: "",
    assessmentYear: "",
    roadType: "MR",
    holdingCreationYear: "",
    floors: [makeBlankFloor(0)],
  };
}

export function propertyFormToPayload(form: AdminPropertyFormState): Record<string, unknown> {
  return {
    ownerName: form.ownerName.trim(),
    areaSqft: Number(form.areaSqft) || 0,
    address: form.address.trim(),
    ward: form.ward.trim() || null,
    assessmentYear: form.assessmentYear.trim(),
    roadType: form.roadType,
    holdingCreationYear: form.holdingCreationYear.trim(),
    floors: form.floors.map((f) => ({
      floorLabel: f.floorLabel,
      buildupSqft: Number(f.buildupSqft) || 0,
      constType: f.constType,
      usageType: f.usageType,
      occupancy: f.occupancy,
      yearBuilt: f.yearBuilt.trim() || null,
      closingYear: f.closingYear.trim() || null,
    })),
  };
}

/** Prefills from the shape GET /properties/:holdingNo returns (see AdminFullPropertyResult in lib/admin-api.ts). */
export function propertyFormFromExisting(property: Record<string, unknown>, floors: Record<string, unknown>[]): AdminPropertyFormState {
  return {
    ownerName: String(property.owner_name ?? ""),
    areaSqft: String(property.area_sqft ?? ""),
    address: String(property.address ?? ""),
    ward: String(property.ward ?? ""),
    assessmentYear: String(property.assessment_year ?? ""),
    roadType: (property.road_type as "PMR" | "MR" | "OR") ?? "MR",
    holdingCreationYear: String(property.holding_creation_year ?? ""),
    floors:
      floors.length > 0
        ? floors.map((f, i) => ({
            key: `existing-${i}`,
            floorLabel: String(f.floor_label ?? ""),
            buildupSqft: String(f.buildup_sqft ?? ""),
            constType: (f.const_type as "RCC" | "Asbestos" | "Other") ?? "RCC",
            usageType: String(f.usage_type ?? ""),
            occupancy: (f.occupancy as "self" | "rented") ?? "self",
            yearBuilt: String(f.year_built ?? ""),
            closingYear: String(f.closing_year ?? ""),
          }))
        : [makeBlankFloor(0)],
  };
}

export function AdminPropertyDetailsForm({
  form,
  onChange,
  usageTypes,
}: {
  form: AdminPropertyFormState;
  onChange: (next: AdminPropertyFormState) => void;
  usageTypes: string[];
}) {
  function updateField<K extends keyof AdminPropertyFormState>(key: K, value: AdminPropertyFormState[K]) {
    onChange({ ...form, [key]: value });
  }

  function updateFloor(index: number, next: FloorFormState) {
    const floors = form.floors.slice();
    floors[index] = next;
    onChange({ ...form, floors });
  }

  function addFloor() {
    onChange({ ...form, floors: [...form.floors, makeBlankFloor(form.floors.length)] });
  }

  function removeFloor(index: number) {
    onChange({ ...form, floors: form.floors.filter((_, i) => i !== index) });
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Owner name</label>
          <input value={form.ownerName} onChange={(e) => updateField("ownerName", e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Total area (sq ft)</label>
          <input type="number" min="0" value={form.areaSqft} onChange={(e) => updateField("areaSqft", e.target.value)} className={inputClass} />
        </div>
      </div>

      <div>
        <label className={labelClass}>Address</label>
        <input value={form.address} onChange={(e) => updateField("address", e.target.value)} className={inputClass} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className={labelClass}>Ward</label>
          <input value={form.ward} onChange={(e) => updateField("ward", e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Assessment year (YYYY-YYYY)</label>
          <input value={form.assessmentYear} onChange={(e) => updateField("assessmentYear", e.target.value)} placeholder="2023-2024" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Road type</label>
          <select value={form.roadType} onChange={(e) => updateField("roadType", e.target.value as "PMR" | "MR" | "OR")} className={inputClass}>
            <option value="PMR">Principal Main Road (PMR)</option>
            <option value="MR">Main Road (MR)</option>
            <option value="OR">Other Road (OR)</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Holding creation year (YYYY-YYYY)</label>
          <input value={form.holdingCreationYear} onChange={(e) => updateField("holdingCreationYear", e.target.value)} placeholder="2020-2021" className={inputClass} />
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">Floors</h3>
          <button type="button" onClick={addFloor} className="inline-flex items-center gap-1 text-xs font-semibold text-nnm-blue hover:underline">
            <Plus className="h-3.5 w-3.5" />
            Add floor
          </button>
        </div>
        <div className="space-y-3">
          {form.floors.map((floor, i) => (
            <FloorRow key={floor.key} floor={floor} usageTypes={usageTypes} onChange={(next) => updateFloor(i, next)} onRemove={() => removeFloor(i)} removable={form.floors.length > 1} />
          ))}
        </div>
      </div>
    </div>
  );
}
