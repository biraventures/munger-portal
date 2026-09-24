/**
 * Fleet Baseline Survey field-definition registry - the single source
 * of truth for the asset category/type hierarchy and every
 * asset-type-specific technical field. Drives both server-side
 * validation of technical_data and the frontend's dynamic survey form
 * (select Asset Category -> Asset Type -> only relevant fields
 * appear), per the frozen architecture from the design discussion:
 * one authoritative home per field, no field asked twice.
 *
 * This is a PHASED registry - not every technical module from the
 * design is implemented yet (17 total are planned). An asset type
 * with no entry in TECHNICAL_MODULES_BY_ASSET_TYPE simply gets no
 * technical fields shown yet (the common/master survey - condition,
 * defects, utilisation, AMC - still fully applies to it either way).
 * Expand FIELD_DEFINITIONS and TECHNICAL_MODULES_BY_ASSET_TYPE
 * together as later modules are built.
 */

export type FieldType = "text" | "number" | "boolean" | "select" | "multiselect" | "textarea";

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  unit?: string;
}

export interface TechnicalModuleDef {
  key: string;
  label: string;
  fields: FieldDef[];
  /** Named sub-groups within the module - e.g. Suction/Jetting's F1/F2, Small Collection's ICE/EV branch. Rendered as visually distinct sections; "exclusive" sub-sections (only one applies, chosen by the surveyor) vs "additive" ones (both can apply) are just a frontend UX distinction, not encoded here. */
  subsections?: { key: string; label: string; fields: FieldDef[] }[];
}

// ---------------------------------------------------------------------
// Asset Category -> Asset Type hierarchy
// ---------------------------------------------------------------------

export const ASSET_CATEGORIES = [
  "Road Vehicle",
  "Tractor",
  "Trailer",
  "Mobile Construction Equipment",
  "Waste Processing/Collection Equipment",
  "Water Management Equipment",
  "Sewer/Drain Cleaning Equipment",
  "Road Sweeping Equipment",
  "Robotic Equipment",
  "Material Handling Equipment",
  "Workshop/Support Equipment",
  "Other Municipal Equipment",
] as const;

/**
 * Every asset type, grouped by category. Consolidated per the design
 * discussion - e.g. every excavator variant (Mini/Crawler/Poclain/
 * Large) collapses into one "Hydraulic Excavator" type, with
 * excavator_class (Mini/Compact/Medium/Large) as the separate
 * dimension distinguishing them, not a separate type each.
 */
export const ASSET_TYPES_BY_CATEGORY: Record<string, string[]> = {
  "Road Vehicle": [
    "Mini Tipper", "LCV Tipper", "Hydraulic Tipper Truck", "Tipping Dumper", "Dumper Truck",
    "Hook Loader", "Skip Loader", "Utility Vehicle", "Pickup Truck", "Light Commercial Vehicle",
    "Multi-Utility Vehicle (MUV)",
  ],
  "Tractor": [
    "Tractor", "Tractor-Trailer Combination", "Tractor Mounted Water Tanker", "Tractor Mounted Sprinkler",
    "Tractor Mounted Loader", "Tractor Mounted Backhoe Loader",
  ],
  "Trailer": ["Trailer"],
  "Mobile Construction Equipment": ["Backhoe Loader", "Wheel Loader", "Skid Steer Loader", "Hydraulic Excavator"],
  "Waste Processing/Collection Equipment": [
    "Compactor Truck", "Rear-Loading Refuse Compactor", "Front-Loading Refuse Compactor", "Side-Loading Refuse Compactor",
    "Auto-Tipper / Three-Wheeler Tipper", "Electric Garbage Collection Vehicle", "Battery Operated Garbage Cart",
    "Garbage Lifting Vehicle", "Container Carrier", "Roll-on/Roll-off (RORO) Container Carrier",
  ],
  "Water Management Equipment": ["Water Tanker", "Water Sprinkler Tanker"],
  "Sewer/Drain Cleaning Equipment": [
    "Sewer Jetting Machine", "Sewer Jetting-cum-Suction Machine", "Septic Tank Suction Machine",
    "Suction-Cum-Jetting Machine", "Drain Cleaning Machine", "Road/Drain Desilting Machine",
  ],
  "Road Sweeping Equipment": ["Mechanical Sweeper", "Truck Mounted Mechanical Sweeper", "Vacuum Road Sweeper"],
  "Robotic Equipment": ["Robotic Drain Cleaning Machine", "Remote-Controlled Robotic Cleaning Machine"],
  "Material Handling Equipment": ["Vehicle Mounted Crane", "Truck Mounted Crane", "Forklift"],
  "Workshop/Support Equipment": ["Service/Workshop Vehicle", "Mobile Workshop Vehicle"],
  "Other Municipal Equipment": ["Other Special-Purpose Municipal Equipment"],
};

/** Only "Hydraulic Excavator" uses this - the class dimension replacing separate Mini/Compact/Medium/Large types. */
export const EXCAVATOR_CLASSES = ["Mini", "Compact", "Medium", "Large"] as const;

// ---------------------------------------------------------------------
// Technical modules (PHASED - see file header). Each asset type maps
// to zero or more module keys; the frontend renders each module's
// fields as its own section, in order, and multiple modules can
// apply to the same asset type (e.g. "Mini Tipper" gets both
// road_vehicle and tipping_body).
// ---------------------------------------------------------------------

export const TECHNICAL_MODULES: Record<string, TechnicalModuleDef> = {
  road_vehicle: {
    key: "road_vehicle",
    label: "Road Vehicle - Common Questions",
    fields: [
      { key: "chassisManufacturer", label: "Chassis manufacturer", type: "text" },
      { key: "chassisModel", label: "Chassis model", type: "text" },
      { key: "engineDisplacement", label: "Engine displacement", type: "text" },
      { key: "gvw", label: "GVW", type: "number", unit: "kg" },
      { key: "kerbWeight", label: "Kerb weight", type: "number", unit: "kg" },
      { key: "payload", label: "Payload", type: "number", unit: "kg" },
      { key: "wheelbase", label: "Wheelbase", type: "number", unit: "mm" },
      { key: "axles", label: "Number of axles", type: "number" },
      { key: "driveConfiguration", label: "Drive configuration", type: "text" },
      { key: "transmission", label: "Transmission", type: "text" },
      { key: "tyreSpecification", label: "Tyre specification", type: "text" },
      { key: "fuelTankCapacity", label: "Fuel tank capacity", type: "number", unit: "L" },
      { key: "cabinType", label: "Cabin type", type: "text" },
      { key: "ac", label: "AC", type: "boolean" },
      { key: "powerSteering", label: "Power steering", type: "boolean" },
      { key: "abs", label: "ABS", type: "boolean" },
      { key: "reverseAlarm", label: "Reverse alarm", type: "boolean" },
      { key: "gps", label: "GPS", type: "boolean" },
      { key: "gpsDeviceId", label: "GPS device ID", type: "text" },
    ],
  },

  tipping_body: {
    key: "tipping_body",
    label: "Tipping Body",
    fields: [
      { key: "bodyType", label: "Body type", type: "text" },
      { key: "bodyManufacturer", label: "Body manufacturer", type: "text" },
      { key: "bodyMaterial", label: "Body material", type: "text" },
      { key: "bodyLength", label: "Body length", type: "number", unit: "mm" },
      { key: "bodyWidth", label: "Body width", type: "number", unit: "mm" },
      { key: "bodyHeight", label: "Body height", type: "number", unit: "mm" },
      { key: "volumetricCapacity", label: "Volumetric capacity", type: "number", unit: "m³" },
      { key: "actualUsableCapacity", label: "Actual usable capacity", type: "number", unit: "m³" },
      { key: "payloadCapacity", label: "Payload capacity", type: "number", unit: "kg" },
      { key: "hydraulicTipping", label: "Hydraulic tipping", type: "boolean" },
      { key: "tippingMechanism", label: "Tipping mechanism", type: "text" },
      { key: "tippingAngle", label: "Tipping angle", type: "number", unit: "°" },
      { key: "hydraulicCylinderType", label: "Hydraulic cylinder type", type: "text" },
      { key: "hydraulicPump", label: "Hydraulic pump", type: "text" },
      { key: "hydraulicOilCapacity", label: "Hydraulic oil capacity", type: "number", unit: "L" },
      { key: "tailgateType", label: "Tailgate type", type: "text" },
      { key: "bodyFloorThickness", label: "Body floor thickness", type: "text" },
      { key: "sideWallThickness", label: "Side-wall thickness", type: "text" },
    ],
  },

  refuse_compactor: {
    key: "refuse_compactor",
    label: "Garbage Compactor",
    fields: [
      { key: "compactorManufacturer", label: "Compactor manufacturer", type: "text" },
      { key: "compactorModel", label: "Compactor model", type: "text" },
      { key: "compactorType", label: "Compactor type", type: "text" },
      { key: "bodyCapacity", label: "Body capacity", type: "number", unit: "m³" },
      { key: "hopperCapacity", label: "Hopper capacity", type: "number", unit: "m³" },
      { key: "payload", label: "Payload", type: "number", unit: "kg" },
      { key: "compactionMechanism", label: "Compaction mechanism", type: "text" },
      { key: "compactionRatio", label: "Compaction ratio", type: "text" },
      { key: "compactionForce", label: "Compaction force", type: "text" },
      { key: "loadingMechanism", label: "Loading mechanism", type: "text" },
      { key: "loadingHeight", label: "Loading height", type: "number", unit: "mm" },
      { key: "ejectorMechanism", label: "Ejector mechanism", type: "text" },
      { key: "ejectorPlate", label: "Ejector plate", type: "text" },
      { key: "leachateTank", label: "Leachate tank", type: "boolean" },
      { key: "leachateTankCapacity", label: "Leachate tank capacity", type: "number", unit: "L" },
      { key: "washoutSystem", label: "Washout system", type: "text" },
      { key: "hydraulicPump", label: "Hydraulic pump", type: "text" },
      { key: "hydraulicPressure", label: "Hydraulic pressure", type: "text" },
      { key: "hydraulicOilCapacity", label: "Hydraulic oil capacity", type: "number", unit: "L" },
      { key: "controlSystem", label: "Control system", type: "text" },
      { key: "emergencyStop", label: "Emergency stop", type: "boolean" },
      { key: "cycleTime", label: "Cycle time", type: "text" },
      { key: "avgCompactionCyclesPerDay", label: "Average number of compaction cycles per day", type: "number" },
    ],
  },

  tractor: {
    key: "tractor",
    label: "Tractor",
    fields: [
      { key: "manufacturer", label: "Manufacturer", type: "text" },
      { key: "model", label: "Model", type: "text" },
      { key: "enginePower", label: "Engine power", type: "text" },
      { key: "engineDisplacement", label: "Engine displacement", type: "text" },
      { key: "cylinders", label: "Cylinders", type: "number" },
      { key: "ratedRpm", label: "Rated RPM", type: "number" },
      { key: "transmission", label: "Transmission", type: "text" },
      { key: "numberOfGears", label: "Number of gears", type: "number" },
      { key: "drive", label: "Drive", type: "select", options: ["2WD", "4WD"] },
      { key: "ptoType", label: "PTO type", type: "text" },
      { key: "ptoSpeed", label: "PTO speed", type: "text" },
      { key: "ptoPower", label: "PTO power", type: "text" },
      { key: "hydraulicLiftCapacity", label: "Hydraulic lift capacity", type: "text" },
      { key: "hitchCategory", label: "Hitch category", type: "text" },
      { key: "frontTyre", label: "Front tyre", type: "text" },
      { key: "rearTyre", label: "Rear tyre", type: "text" },
      { key: "mountedAttachment", label: "Mounted attachment", type: "select", options: ["Trailer", "Water Tanker", "Sprinkler", "Loader", "Backhoe", "Other"] },
    ],
  },

  trailer: {
    key: "trailer",
    label: "Trailer",
    fields: [
      { key: "manufacturer", label: "Manufacturer", type: "text" },
      { key: "model", label: "Model", type: "text" },
      { key: "trailerType", label: "Trailer type", type: "text" },
      { key: "payloadCapacity", label: "Payload capacity", type: "number", unit: "kg" },
      { key: "bodyLength", label: "Body length", type: "number", unit: "mm" },
      { key: "bodyWidth", label: "Body width", type: "number", unit: "mm" },
      { key: "bodyHeight", label: "Body height", type: "number", unit: "mm" },
      { key: "numberOfAxles", label: "Number of axles", type: "number" },
      { key: "axleConfiguration", label: "Axle configuration", type: "text" },
      { key: "tyreSpecification", label: "Tyre specification", type: "text" },
      { key: "hitchType", label: "Hitch type", type: "text" },
      { key: "brakingSystem", label: "Braking system", type: "text" },
      { key: "tareWeight", label: "Tare weight", type: "number", unit: "kg" },
    ],
  },

  water_tanker_sprinkler: {
    key: "water_tanker_sprinkler",
    label: "Water Tanker / Sprinkler",
    fields: [
      { key: "tankManufacturer", label: "Tank manufacturer", type: "text" },
      { key: "tankMaterial", label: "Tank material", type: "text" },
      { key: "tankCapacity", label: "Tank capacity", type: "number", unit: "L" },
      { key: "numberOfCompartments", label: "Number of compartments", type: "number" },
      { key: "pumpManufacturer", label: "Pump manufacturer", type: "text" },
      { key: "pumpModel", label: "Pump model", type: "text" },
      { key: "pumpType", label: "Pump type", type: "text" },
      { key: "pumpCapacity", label: "Pump capacity", type: "text", unit: "LPM" },
      { key: "pumpPressure", label: "Pump pressure", type: "text" },
      { key: "pumpDrive", label: "Pump drive", type: "select", options: ["PTO", "Hydraulic", "Engine"] },
      { key: "waterFillingArrangement", label: "Water filling arrangement", type: "text" },
      { key: "dischargeArrangement", label: "Discharge arrangement", type: "text" },
      { key: "hoseLength", label: "Hose length", type: "text" },
      { key: "hoseReel", label: "Hose reel", type: "boolean" },
      { key: "sprayGun", label: "Spray gun", type: "boolean" },
      { key: "numberOfNozzles", label: "Number of nozzles", type: "number" },
      { key: "nozzleType", label: "Nozzle type", type: "text" },
      { key: "sprinklingWidth", label: "Sprinkling width", type: "text" },
      { key: "frontSpray", label: "Front spray", type: "boolean" },
      { key: "rearSpray", label: "Rear spray", type: "boolean" },
      { key: "sideSpray", label: "Side spray", type: "boolean" },
      { key: "typicalWaterConsumptionPerDay", label: "Typical water consumption per operating day", type: "number", unit: "L" },
    ],
  },

  suction_jetting: {
    key: "suction_jetting",
    label: "Suction / Sewer Cleaning",
    fields: [
      { key: "maxDrainDiameterServiced", label: "Maximum drain/sewer diameter serviced", type: "text" },
      { key: "maxPracticalSuctionDepth", label: "Maximum practical suction depth", type: "text" },
    ],
    subsections: [
      {
        key: "suction_system",
        label: "F1. Suction System",
        fields: [
          { key: "suctionTankCapacity", label: "Tank capacity", type: "number", unit: "L" },
          { key: "suctionTankMaterial", label: "Tank material", type: "text" },
          { key: "vacuumPumpManufacturer", label: "Vacuum pump manufacturer", type: "text" },
          { key: "vacuumPumpModel", label: "Pump model", type: "text" },
          { key: "vacuumPumpType", label: "Pump type", type: "text" },
          { key: "maximumVacuum", label: "Maximum vacuum", type: "text" },
          { key: "vacuumPumpCapacity", label: "Pump capacity", type: "text" },
          { key: "suctionHoseDiameter", label: "Suction hose diameter", type: "text" },
          { key: "suctionHoseLength", label: "Suction hose length", type: "text" },
          { key: "suctionHoseReel", label: "Hose reel", type: "boolean" },
          { key: "numberOfSuctionHoses", label: "Number of hoses", type: "number" },
          { key: "dischargeValve", label: "Discharge valve", type: "text" },
          { key: "dischargeMechanism", label: "Discharge mechanism", type: "text" },
          { key: "vacuumGauge", label: "Vacuum gauge", type: "boolean" },
          { key: "safetyValve", label: "Safety valve", type: "boolean" },
        ],
      },
      {
        key: "jetting_system",
        label: "F2. Jetting System",
        fields: [
          { key: "jettingWaterTankCapacity", label: "Water tank capacity", type: "number", unit: "L" },
          { key: "jettingPumpManufacturer", label: "Jetting pump manufacturer", type: "text" },
          { key: "jettingPumpModel", label: "Pump model", type: "text" },
          { key: "jettingPumpType", label: "Pump type", type: "text" },
          { key: "jettingPumpCapacity", label: "Pump capacity", type: "text", unit: "LPM" },
          { key: "jettingMaxPressure", label: "Maximum pressure", type: "text" },
          { key: "jettingOperatingPressure", label: "Operating pressure", type: "text" },
          { key: "jettingHoseDiameter", label: "Jetting hose diameter", type: "text" },
          { key: "jettingHoseLength", label: "Jetting hose length", type: "text" },
          { key: "jettingHoseReel", label: "Hose reel", type: "boolean" },
          { key: "jettingNozzleType", label: "Nozzle type", type: "text" },
          { key: "jettingNumberOfNozzles", label: "Number of nozzles", type: "number" },
          { key: "jettingPressureGauge", label: "Pressure gauge", type: "boolean" },
        ],
      },
    ],
  },

  road_sweeper: {
    key: "road_sweeper",
    label: "Road Sweeping",
    fields: [
      { key: "manufacturer", label: "Manufacturer", type: "text" },
      { key: "model", label: "Model", type: "text" },
      { key: "sweeperType", label: "Sweeper type", type: "text" },
      { key: "operatingWeight", label: "Operating weight", type: "number", unit: "kg" },
      { key: "enginePower", label: "Engine power", type: "text" },
      { key: "hopperCapacity", label: "Hopper capacity", type: "number", unit: "m³" },
      { key: "waterTankCapacity", label: "Water tank capacity", type: "number", unit: "L" },
      { key: "sweepingWidth", label: "Sweeping width", type: "text" },
      { key: "mainBrush", label: "Main brush", type: "text" },
      { key: "sideBrush", label: "Side brush", type: "text" },
      { key: "numberOfSideBrushes", label: "Number of side brushes", type: "number" },
      { key: "brushDiameter", label: "Brush diameter", type: "text" },
      { key: "brushMaterial", label: "Brush material", type: "text" },
      { key: "brushSpeed", label: "Brush speed", type: "text" },
      { key: "dustSuppression", label: "Dust suppression", type: "text" },
      { key: "suctionSystem", label: "Suction system", type: "text" },
      { key: "filterSystem", label: "Filter system", type: "text" },
      { key: "hopperDischargeMechanism", label: "Hopper discharge mechanism", type: "text" },
      { key: "actualSweepingWidth", label: "Actual sweeping width under normal operating conditions", type: "text" },
    ],
  },

  hydraulic_excavator: {
    key: "hydraulic_excavator",
    label: "Hydraulic Excavator",
    fields: [
      { key: "manufacturer", label: "Manufacturer", type: "text" },
      { key: "model", label: "Model", type: "text" },
      { key: "enginePower", label: "Engine power", type: "text" },
      { key: "operatingWeight", label: "Operating weight", type: "number", unit: "kg" },
      { key: "engineDisplacement", label: "Engine displacement", type: "text" },
      { key: "fuelType", label: "Fuel type", type: "text" },
      { key: "bucketCapacity", label: "Bucket capacity", type: "text" },
      { key: "bucketWidth", label: "Bucket width", type: "text" },
      { key: "maxDiggingDepth", label: "Maximum digging depth", type: "text" },
      { key: "maxReach", label: "Maximum reach", type: "text" },
      { key: "maxDiggingHeight", label: "Maximum digging height", type: "text" },
      { key: "maxDumpingHeight", label: "Maximum dumping height", type: "text" },
      { key: "boomLength", label: "Boom length", type: "text" },
      { key: "armLength", label: "Arm length", type: "text" },
      { key: "hydraulicPump", label: "Hydraulic pump", type: "text" },
      { key: "hydraulicFlow", label: "Hydraulic flow", type: "text" },
      { key: "hydraulicPressure", label: "Hydraulic pressure", type: "text" },
      { key: "hydraulicOilCapacity", label: "Hydraulic oil capacity", type: "number", unit: "L" },
      { key: "fuelTankCapacity", label: "Fuel tank capacity", type: "number", unit: "L" },
      { key: "trackShoeWidth", label: "Track shoe width", type: "text" },
      { key: "groundClearance", label: "Ground clearance", type: "text" },
      { key: "tailSwingRadius", label: "Tail swing radius", type: "text" },
      { key: "travelSpeed", label: "Travel speed", type: "text" },
      { key: "swingSpeed", label: "Swing speed", type: "text" },
      {
        key: "attachmentFitted",
        label: "Attachment currently fitted",
        type: "select",
        options: ["Standard bucket", "Rock bucket", "Clamshell bucket", "Hydraulic breaker", "Grapple", "Other"],
      },
    ],
  },

  backhoe_loader: {
    key: "backhoe_loader",
    label: "Backhoe Loader",
    fields: [
      { key: "manufacturer", label: "Manufacturer", type: "text" },
      { key: "model", label: "Model", type: "text" },
      { key: "enginePower", label: "Engine power", type: "text" },
      { key: "operatingWeight", label: "Operating weight", type: "number", unit: "kg" },
      { key: "fuelType", label: "Fuel type", type: "text" },
      { key: "transmission", label: "Transmission", type: "text" },
      { key: "driveConfiguration", label: "Drive configuration", type: "text" },
      { key: "tyreSpecification", label: "Tyre specification", type: "text" },
    ],
    subsections: [
      {
        key: "loader_end",
        label: "Loader",
        fields: [
          { key: "loaderBucketCapacity", label: "Bucket capacity", type: "text" },
          { key: "loaderBucketWidth", label: "Bucket width", type: "text" },
          { key: "dumpHeight", label: "Dump height", type: "text" },
          { key: "dumpReach", label: "Dump reach", type: "text" },
          { key: "loaderBreakoutForce", label: "Breakout force", type: "text" },
          { key: "liftCapacity", label: "Lift capacity", type: "text" },
        ],
      },
      {
        key: "backhoe_end",
        label: "Backhoe",
        fields: [
          { key: "backhoeBucketCapacity", label: "Bucket capacity", type: "text" },
          { key: "backhoeBucketWidth", label: "Bucket width", type: "text" },
          { key: "diggingDepth", label: "Digging depth", type: "text" },
          { key: "backhoeMaxReach", label: "Maximum reach", type: "text" },
          { key: "loadingHeight", label: "Loading height", type: "text" },
          { key: "backhoeBreakoutForce", label: "Breakout force", type: "text" },
          { key: "backhoeHydraulicPressure", label: "Hydraulic pressure", type: "text" },
        ],
      },
    ],
  },

  standalone_loader: {
    key: "standalone_loader",
    label: "Standalone Loader",
    fields: [
      { key: "manufacturer", label: "Manufacturer", type: "text" },
      { key: "model", label: "Model", type: "text" },
      { key: "enginePower", label: "Engine power", type: "text" },
      { key: "engineDisplacement", label: "Engine displacement", type: "text" },
      { key: "fuelType", label: "Fuel type", type: "text" },
      { key: "operatingWeight", label: "Operating weight", type: "number", unit: "kg" },
      { key: "ratedOperatingCapacity", label: "Rated operating capacity", type: "text" },
      { key: "tippingLoad", label: "Tipping load", type: "text" },
      { key: "bucketCapacity", label: "Bucket capacity", type: "text" },
      { key: "bucketWidth", label: "Bucket width", type: "text" },
      { key: "breakoutForce", label: "Breakout force", type: "text" },
      { key: "liftHeight", label: "Lift height", type: "text" },
      { key: "dumpHeight", label: "Dump height", type: "text" },
      { key: "dumpReach", label: "Dump reach", type: "text" },
      { key: "hydraulicPressure", label: "Hydraulic pressure", type: "text" },
      { key: "hydraulicFlow", label: "Hydraulic flow", type: "text" },
      { key: "hydraulicOilCapacity", label: "Hydraulic oil capacity", type: "number", unit: "L" },
      { key: "maximumSpeed", label: "Maximum speed", type: "text" },
      { key: "tyreTrackSpecification", label: "Tyre/track specification", type: "text" },
    ],
    subsections: [
      {
        key: "skid_steer_specific",
        label: "For Skid Steer specifically",
        fields: [
          { key: "auxiliaryHydraulicFlow", label: "Auxiliary hydraulic flow", type: "text" },
          { key: "hydraulicCircuit", label: "Standard/high-flow hydraulic circuit", type: "select", options: ["Standard", "High-flow"] },
          { key: "attachmentMountingType", label: "Attachment mounting type", type: "text" },
          { key: "liftConfiguration", label: "Lift configuration", type: "text" },
          { key: "cabRopsFops", label: "Cab/ROPS/FOPS", type: "text" },
          {
            key: "attachment",
            label: "Attachment",
            type: "multiselect",
            options: ["Standard bucket", "Grapple", "Fork", "Sweeper", "Dozer blade", "Auger", "Hydraulic breaker", "Other"],
          },
        ],
      },
    ],
  },

  crane_lifting: {
    key: "crane_lifting",
    label: "Crane / Lifting Equipment",
    fields: [
      { key: "craneManufacturer", label: "Crane manufacturer", type: "text" },
      { key: "craneModel", label: "Crane model", type: "text" },
      { key: "craneType", label: "Crane type", type: "text" },
      { key: "ratedCapacity", label: "Rated capacity", type: "text" },
      { key: "maxLiftingCapacity", label: "Maximum lifting capacity", type: "text" },
      { key: "maxLiftingHeight", label: "Maximum lifting height", type: "text" },
      { key: "maxWorkingRadius", label: "Maximum working radius", type: "text" },
      { key: "minWorkingRadius", label: "Minimum working radius", type: "text" },
      { key: "loadChartAvailable", label: "Load chart available", type: "boolean" },
      { key: "boomType", label: "Boom type", type: "text" },
      { key: "boomLength", label: "Boom length", type: "text" },
      { key: "numberOfBoomSections", label: "Number of boom sections", type: "number" },
      { key: "jib", label: "Jib", type: "boolean" },
      { key: "jibLength", label: "Jib length", type: "text" },
      { key: "hydraulicSystem", label: "Hydraulic system", type: "text" },
      { key: "hydraulicPressure", label: "Hydraulic pressure", type: "text" },
      { key: "hydraulicPump", label: "Hydraulic pump", type: "text" },
      { key: "hydraulicOilCapacity", label: "Hydraulic oil capacity", type: "number", unit: "L" },
      { key: "outriggers", label: "Outriggers", type: "boolean" },
      { key: "numberOfOutriggers", label: "Number of outriggers", type: "number" },
      { key: "outriggerSpan", label: "Outrigger span", type: "text" },
      { key: "winch", label: "Winch", type: "boolean" },
      { key: "winchCapacity", label: "Winch capacity", type: "text" },
      { key: "hookBlockCapacity", label: "Hook block capacity", type: "text" },
      { key: "rotationSlewAngle", label: "Rotation/slew angle", type: "text" },
      { key: "controlType", label: "Control type", type: "text" },
      { key: "remoteControl", label: "Remote control", type: "boolean" },
      { key: "safetyLoadLimitingSystem", label: "Safety/load limiting system", type: "text" },
      { key: "swlAtSpecifiedRadius", label: "Safe Working Load (SWL) / Rated Capacity at specified radius", type: "text" },
    ],
  },

  forklift: {
    key: "forklift",
    label: "Forklift / Material Handling",
    fields: [
      { key: "manufacturer", label: "Manufacturer", type: "text" },
      { key: "model", label: "Model", type: "text" },
      { key: "forkliftType", label: "Forklift type", type: "text" },
      { key: "fuelPowerType", label: "Fuel/power type", type: "text" },
      { key: "engineMotorPower", label: "Engine/motor power", type: "text" },
      { key: "operatingWeight", label: "Operating weight", type: "number", unit: "kg" },
      { key: "ratedLoadCapacity", label: "Rated load capacity", type: "text" },
      { key: "loadCentreDistance", label: "Load centre distance", type: "text" },
      { key: "maxLiftHeight", label: "Maximum lift height", type: "text" },
      { key: "freeLiftHeight", label: "Free lift height", type: "text" },
      { key: "mastType", label: "Mast type", type: "text" },
      { key: "numberOfMastStages", label: "Number of mast stages", type: "number" },
      { key: "forkLength", label: "Fork length", type: "text" },
      { key: "forkWidth", label: "Fork width", type: "text" },
      { key: "forkCarriageWidth", label: "Fork carriage width", type: "text" },
      { key: "tiltAngle", label: "Tilt angle", type: "text" },
      { key: "turningRadius", label: "Turning radius", type: "text" },
      { key: "groundClearance", label: "Ground clearance", type: "text" },
      { key: "maxTravelSpeed", label: "Maximum travel speed", type: "text" },
      { key: "batteryCapacity", label: "Battery capacity (electric)", type: "text" },
      { key: "fuelTankCapacity", label: "Fuel tank capacity (ICE)", type: "number", unit: "L" },
      { key: "tyreType", label: "Tyre type", type: "text" },
      { key: "tyreSize", label: "Tyre size", type: "text" },
      { key: "ropsFops", label: "ROPS/FOPS", type: "boolean" },
      { key: "seatBelt", label: "Seat belt", type: "boolean" },
      { key: "reverseAlarm", label: "Reverse alarm", type: "boolean" },
      { key: "warningBeacon", label: "Warning beacon", type: "boolean" },
      { key: "loadIndicator", label: "Load indicator", type: "boolean" },
      { key: "forkLockingMechanism", label: "Fork locking mechanism", type: "boolean" },
    ],
  },

  robotic_cleaning: {
    key: "robotic_cleaning",
    label: "Robotic Cleaning Equipment",
    fields: [
      { key: "manufacturer", label: "Manufacturer", type: "text" },
      { key: "model", label: "Model", type: "text" },
      { key: "machineType", label: "Machine type", type: "text" },
      { key: "dimensions", label: "Dimensions", type: "text" },
      { key: "operatingWeight", label: "Operating weight", type: "text" },
      { key: "powerSource", label: "Power source", type: "text" },
      { key: "batteryType", label: "Battery type", type: "text" },
      { key: "batteryCapacity", label: "Battery capacity", type: "text" },
      { key: "operatingVoltage", label: "Operating voltage", type: "text" },
      { key: "operatingTime", label: "Operating time", type: "text" },
      { key: "chargingTime", label: "Charging time", type: "text" },
      { key: "driveSystem", label: "Drive system", type: "text" },
      { key: "maximumSpeed", label: "Maximum speed", type: "text" },
      { key: "maxOperatingDepth", label: "Maximum operating depth", type: "text" },
      { key: "maxPipeDrainDiameter", label: "Maximum pipe/drain diameter", type: "text" },
      { key: "maxSlope", label: "Maximum slope", type: "text" },
      { key: "remoteControlRange", label: "Remote-control range", type: "text" },
      { key: "camera", label: "Camera", type: "boolean" },
      { key: "cameraResolution", label: "Camera resolution", type: "text" },
      { key: "lighting", label: "Lighting", type: "text" },
      { key: "cableLength", label: "Cable length", type: "text" },
      { key: "cutter", label: "Cutter", type: "boolean" },
      { key: "cutterDiameter", label: "Cutter diameter", type: "text" },
      { key: "cutterMotorPower", label: "Cutter motor power", type: "text" },
      { key: "suctionSystem", label: "Suction system", type: "boolean" },
      { key: "debrisCapacity", label: "Debris capacity", type: "text" },
      { key: "waterJetting", label: "Water jetting", type: "boolean" },
      { key: "jettingPressure", label: "Jetting pressure", type: "text" },
      { key: "jettingFlow", label: "Jetting flow", type: "text" },
      { key: "batterySoh", label: "Battery SOH", type: "text" },
    ],
  },

  container_handling: {
    key: "container_handling",
    label: "Container Handling",
    fields: [
      { key: "equipmentManufacturer", label: "Equipment manufacturer", type: "text" },
      { key: "equipmentModel", label: "Equipment model", type: "text" },
      { key: "handlingSystemType", label: "Handling system type", type: "text" },
      { key: "hydraulicSystemType", label: "Hydraulic system type", type: "text" },
      { key: "hydraulicPumpManufacturer", label: "Hydraulic pump manufacturer", type: "text" },
      { key: "hydraulicPumpModel", label: "Hydraulic pump model", type: "text" },
      { key: "hydraulicPressure", label: "Hydraulic pressure", type: "text" },
      { key: "hydraulicOilCapacity", label: "Hydraulic oil capacity", type: "number", unit: "L" },
      { key: "ratedLiftingCapacity", label: "Rated lifting capacity", type: "text" },
      { key: "maxContainerWeight", label: "Maximum container weight", type: "text" },
      { key: "compatibleContainerVolume", label: "Compatible container volume", type: "text" },
      { key: "minContainerVolume", label: "Minimum container volume", type: "text" },
      { key: "maxContainerVolume", label: "Maximum container volume", type: "text" },
      { key: "containerDimensions", label: "Container dimensions", type: "text" },
      { key: "hookHeight", label: "Hook height", type: "text" },
      { key: "hookReach", label: "Hook reach", type: "text" },
      { key: "armType", label: "Arm type", type: "text" },
      { key: "armLength", label: "Arm length", type: "text" },
      { key: "loadingAngle", label: "Loading angle", type: "text" },
      { key: "unloadingAngle", label: "Unloading angle", type: "text" },
      { key: "containerLockingMechanism", label: "Container locking mechanism", type: "text" },
      { key: "hydraulicCylinderSpecification", label: "Hydraulic cylinder specification", type: "text" },
      { key: "loadingTime", label: "Loading time", type: "text" },
      { key: "unloadingTime", label: "Unloading time", type: "text" },
      { key: "ptoRequirement", label: "PTO requirement", type: "boolean" },
      { key: "controlSystem", label: "Control system", type: "text" },
      { key: "safetyInterlock", label: "Safety interlock", type: "boolean" },
      { key: "emergencyStop", label: "Emergency stop", type: "boolean" },
      { key: "containerStandardsCompatibility", label: "Container standards/compatibility", type: "text" },
    ],
  },

  small_collection_ev: {
    key: "small_collection_ev",
    label: "Small Collection Vehicle",
    fields: [
      { key: "manufacturer", label: "Manufacturer", type: "text" },
      { key: "model", label: "Model", type: "text" },
      { key: "vehicleType", label: "Vehicle type", type: "text" },
      { key: "yearOfManufacture", label: "Year of manufacture", type: "number" },
      { key: "operatingWeight", label: "Operating weight", type: "number", unit: "kg" },
      { key: "gvw", label: "GVW", type: "number", unit: "kg" },
      { key: "ratedPayload", label: "Rated payload", type: "number", unit: "kg" },
      { key: "bodyCapacity", label: "Body capacity", type: "number", unit: "m³" },
      { key: "bodyDimensions", label: "Body dimensions", type: "text" },
      { key: "bodyMaterial", label: "Body material", type: "text" },
      { key: "tippingMechanism", label: "Tipping mechanism", type: "text" },
      { key: "tippingAngle", label: "Tipping angle", type: "text" },
      { key: "maximumSpeed", label: "Maximum speed", type: "text" },
      { key: "wheelConfiguration", label: "Wheel configuration", type: "text" },
      { key: "tyreSize", label: "Tyre size", type: "text" },
      { key: "brakingSystem", label: "Braking system", type: "text" },
      { key: "steeringSystem", label: "Steering system", type: "text" },
      { key: "groundClearance", label: "Ground clearance", type: "text" },
    ],
    subsections: [
      {
        key: "ice",
        label: "For ICE vehicles",
        fields: [
          { key: "engineType", label: "Engine type", type: "text" },
          { key: "engineDisplacement", label: "Engine displacement", type: "text" },
          { key: "enginePower", label: "Engine power", type: "text" },
          { key: "fuelType", label: "Fuel type", type: "text" },
          { key: "fuelTankCapacity", label: "Fuel tank capacity", type: "number", unit: "L" },
          { key: "transmission", label: "Transmission", type: "text" },
        ],
      },
      {
        key: "ev",
        label: "For EVs",
        fields: [
          { key: "motorType", label: "Motor type", type: "text" },
          { key: "motorPower", label: "Motor power", type: "text" },
          { key: "batteryManufacturer", label: "Battery manufacturer", type: "text" },
          { key: "batteryTypeChemistry", label: "Battery type/chemistry", type: "text" },
          { key: "batteryCapacity", label: "Battery capacity", type: "text" },
          { key: "batteryVoltage", label: "Battery voltage", type: "text" },
          { key: "chargerRating", label: "Charger rating", type: "text" },
          { key: "chargingTime", label: "Charging time", type: "text" },
          { key: "ratedRange", label: "Rated range", type: "text" },
          { key: "actualOperatingRange", label: "Actual operating range", type: "text" },
          { key: "batterySoh", label: "Battery SOH", type: "text" },
          { key: "batterySerialNumber", label: "Battery serial number", type: "text" },
        ],
      },
      {
        key: "waste_collection",
        label: "Waste collection",
        fields: [
          { key: "collectionBodyType", label: "Collection body type", type: "text" },
          { key: "wasteHopperCapacity", label: "Hopper capacity", type: "text" },
          { key: "loadingMechanism", label: "Loading mechanism", type: "text" },
          { key: "doorType", label: "Door type", type: "text" },
          { key: "wasteTippingMechanism", label: "Tipping mechanism", type: "text" },
          { key: "coverTarpaulin", label: "Cover/tarpaulin", type: "boolean" },
          { key: "leachateArrangement", label: "Leachate arrangement", type: "text" },
        ],
      },
    ],
  },

  mobile_workshop: {
    key: "mobile_workshop",
    label: "Service / Mobile Workshop",
    fields: [
      { key: "workshopBodyManufacturer", label: "Workshop body manufacturer", type: "text" },
      { key: "bodyDimensions", label: "Body dimensions", type: "text" },
      { key: "workbench", label: "Workbench", type: "boolean" },
      { key: "toolStorage", label: "Tool storage", type: "text" },
      { key: "compressor", label: "Compressor", type: "boolean" },
      { key: "compressorCapacity", label: "Compressor capacity", type: "text" },
      { key: "airPressure", label: "Air pressure", type: "text" },
      { key: "weldingMachine", label: "Welding machine", type: "boolean" },
      { key: "weldingCapacity", label: "Welding capacity", type: "text" },
      { key: "generator", label: "Generator", type: "boolean" },
      { key: "generatorCapacity", label: "Generator capacity", type: "text" },
      { key: "hydraulicJack", label: "Hydraulic jack", type: "boolean" },
      { key: "hydraulicPress", label: "Hydraulic press", type: "boolean" },
      { key: "batteryCharger", label: "Battery charger", type: "boolean" },
      { key: "batteryTestingEquipment", label: "Battery testing equipment", type: "boolean" },
      { key: "electricalDiagnosticEquipment", label: "Electrical diagnostic equipment", type: "boolean" },
      { key: "mechanicalTools", label: "Mechanical tools", type: "text" },
      { key: "recoveryWinchSystem", label: "Recovery/winch system", type: "boolean" },
      { key: "craneLiftingArrangement", label: "Crane/lifting arrangement", type: "boolean" },
      { key: "lightingSystem", label: "Lighting system", type: "boolean" },
      { key: "numberOfToolCompartments", label: "Number of tool compartments", type: "number" },
      { key: "workshopEquipmentInventoryValue", label: "Workshop equipment inventory/value", type: "text" },
    ],
  },
};

/**
 * Maps each asset type to the technical module(s) that apply to it.
 * An asset type absent from this map (or mapped to an empty array)
 * simply gets no technical-module fields yet - phased rollout, see
 * file header.
 */
export const TECHNICAL_MODULES_BY_ASSET_TYPE: Record<string, string[]> = {
  "Mini Tipper": ["road_vehicle", "tipping_body"],
  "LCV Tipper": ["road_vehicle", "tipping_body"],
  "Hydraulic Tipper Truck": ["road_vehicle", "tipping_body"],
  "Tipping Dumper": ["road_vehicle", "tipping_body"],
  "Dumper Truck": ["road_vehicle", "tipping_body"],
  "Utility Vehicle": ["road_vehicle"],
  "Pickup Truck": ["road_vehicle"],
  "Light Commercial Vehicle": ["road_vehicle"],
  "Multi-Utility Vehicle (MUV)": ["road_vehicle"],
  "Compactor Truck": ["road_vehicle", "refuse_compactor"],
  "Rear-Loading Refuse Compactor": ["road_vehicle", "refuse_compactor"],
  "Front-Loading Refuse Compactor": ["road_vehicle", "refuse_compactor"],
  "Side-Loading Refuse Compactor": ["road_vehicle", "refuse_compactor"],
  "Hook Loader": ["road_vehicle", "container_handling"],
  "Skip Loader": ["road_vehicle", "container_handling"],
  "Garbage Lifting Vehicle": ["road_vehicle"],
  "Container Carrier": ["road_vehicle", "container_handling"],
  "Roll-on/Roll-off (RORO) Container Carrier": ["road_vehicle", "container_handling"],
  "Auto-Tipper / Three-Wheeler Tipper": ["small_collection_ev"],
  "Electric Garbage Collection Vehicle": ["small_collection_ev"],
  "Battery Operated Garbage Cart": ["small_collection_ev"],
  "Tractor": ["tractor"],
  "Tractor-Trailer Combination": ["tractor", "trailer"],
  "Tractor Mounted Water Tanker": ["tractor", "water_tanker_sprinkler"],
  "Tractor Mounted Sprinkler": ["tractor", "water_tanker_sprinkler"],
  "Tractor Mounted Loader": ["tractor", "standalone_loader"],
  "Tractor Mounted Backhoe Loader": ["tractor", "backhoe_loader"],
  "Trailer": ["trailer"],
  "Water Tanker": ["water_tanker_sprinkler"],
  "Water Sprinkler Tanker": ["water_tanker_sprinkler"],
  "Sewer Jetting Machine": ["suction_jetting"],
  "Sewer Jetting-cum-Suction Machine": ["suction_jetting"],
  "Septic Tank Suction Machine": ["suction_jetting"],
  "Suction-Cum-Jetting Machine": ["suction_jetting"],
  "Drain Cleaning Machine": ["suction_jetting"],
  "Road/Drain Desilting Machine": ["suction_jetting"],
  "Mechanical Sweeper": ["road_sweeper"],
  "Truck Mounted Mechanical Sweeper": ["road_vehicle", "road_sweeper"],
  "Vacuum Road Sweeper": ["road_sweeper"],
  "Backhoe Loader": ["backhoe_loader"],
  "Wheel Loader": ["standalone_loader"],
  "Skid Steer Loader": ["standalone_loader"],
  "Hydraulic Excavator": ["hydraulic_excavator"],
  "Robotic Drain Cleaning Machine": ["robotic_cleaning"],
  "Remote-Controlled Robotic Cleaning Machine": ["robotic_cleaning"],
  "Vehicle Mounted Crane": ["road_vehicle", "crane_lifting"],
  "Truck Mounted Crane": ["road_vehicle", "crane_lifting"],
  "Forklift": ["forklift"],
  "Service/Workshop Vehicle": ["road_vehicle", "mobile_workshop"],
  "Mobile Workshop Vehicle": ["road_vehicle", "mobile_workshop"],
};

export function getTechnicalModulesForAssetType(assetType: string): TechnicalModuleDef[] {
  const keys = TECHNICAL_MODULES_BY_ASSET_TYPE[assetType] ?? [];
  return keys.map((k) => TECHNICAL_MODULES[k]).filter((m): m is TechnicalModuleDef => Boolean(m));
}

// ---------------------------------------------------------------------
// Common Condition Module (Module 06) - identical for every asset,
// grouped exactly as specified. The frontend renders a 1-5 dropdown
// per component listed here.
// ---------------------------------------------------------------------

export const CONDITION_COMPONENT_GROUPS: { group: string; components: string[] }[] = [
  { group: "Mechanical", components: ["Engine/motor", "Transmission", "Clutch", "Differential", "Steering", "Suspension", "Brakes", "Hydraulic system", "PTO"] },
  { group: "Electrical", components: ["Battery", "Alternator", "Starter", "Wiring", "Lights", "Indicators", "Horn", "Instrument cluster"] },
  { group: "Structural", components: ["Chassis/frame", "Body", "Cabin", "Corrosion", "Welds", "Doors", "Safety equipment"] },
  { group: "Tyres/Tracks", components: ["Front tyres", "Rear tyres", "Spare tyre", "Track condition"] },
];

export const CONDITION_SCALE = [
  { value: 1, label: "Excellent" },
  { value: 2, label: "Good" },
  { value: 3, label: "Fair" },
  { value: 4, label: "Poor" },
  { value: 5, label: "Non-functional" },
];

export const OVERALL_STATUS_OPTIONS = [
  "Operational - Good condition",
  "Operational - Minor defects",
  "Operational - Major repair required",
  "Non-operational - Repairable",
  "Beyond Economical Repair / Proposed for Disposal",
];

export const SAFETY_STATUS_OPTIONS = ["Safe for operation", "Operation restricted", "Unsafe - do not operate"];

export const AMC_DISPOSITION_OPTIONS = [
  { value: "A", label: "Comprehensive AMC/CMC suitable" },
  { value: "B", label: "AMC suitable with specified exclusions" },
  { value: "C", label: "Major rehabilitation required before AMC" },
  { value: "D", label: "Not economically suitable for AMC" },
  { value: "E", label: "Proposed for disposal" },
];

export const DEPLOYMENT_STATUS_OPTIONS = [
  "Operationally deployed", "Standby", "Under repair", "Awaiting repair", "Awaiting disposal", "Not deployed", "Other",
];

export const UTILISATION_DATA_SOURCE_OPTIONS = [
  "GPS/telematics", "Logbook", "Weighbridge", "Operator statement", "Supervisor estimate", "Other", "No data available",
];

export const MAINTENANCE_DATA_CONFIDENCE_OPTIONS = [
  "Verified documentary record", "Workshop record", "Operator/logbook record", "Verbal information", "Estimated", "No record",
];

export const DEFECT_SEVERITY_OPTIONS = ["Critical", "Major", "Moderate", "Minor"];
export const DEFECT_PRIORITY_OPTIONS = ["Immediate", "Within 7 days", "Within 30 days", "Routine", "Monitor"];
export const OWNERSHIP_STATUS_OPTIONS = ["Owned", "Leased", "Hired", "On-loan", "Other"];
export const METER_TYPE_OPTIONS = ["Mechanical", "Digital", "Not available"];
