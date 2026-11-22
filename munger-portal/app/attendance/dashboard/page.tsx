"use client";

import Link from "next/link";
import { ScanFace, LayoutGrid, Truck, Droplet, Lightbulb, MapPin, ClipboardList, CheckCircle2, Trash2, Languages, FileUp, Users, ShieldAlert, Gavel, HardHat, UserCog, BarChart3 } from "lucide-react";
import { AttendanceHeader } from "@/components/attendance/attendance-header";
import { PublicComplaintsCard } from "@/components/public-reports/complaints-card";
import { DashboardGroup } from "@/components/admin/dashboard-group";
import { useAttendanceGuard } from "@/lib/use-attendance-guard";
import { useAttendanceLang } from "@/lib/attendance-i18n";
import { transliterateName } from "@/lib/hindi-name-transliterate";

const CORE_ATTENDANCE_ROLES = ["sanitation_officer", "sanitation_prabhari", "attendance_admin"];

const STRINGS = {
  en: {
    loading: "Loading...",
    welcome: "Welcome",
    pickModule: "Pick a module below.",
    attendanceManagement: "Attendance Management",
    attendanceManagementDesc: "Today's overview, reports, photos, feedback, and manage staff/drivers/assistants.",
    fleetRegistry: "Fleet & Asset Registry",
    fleetRegistryDesc: "Vehicles, tricycles, hand carts - status and maintenance history.",
    deactivatedVehicles: "Deactivated Vehicles",
    deactivatedVehiclesDesc: "Field-verify (Junior Engineer) and delete deactivated vehicles.",
    baselineSurvey: "Fleet Baseline Survey",
    baselineSurveyDesc: "The comprehensive opening entry for each vehicle/equipment logbook.",
    surveyProgress: "Survey Progress",
    surveyProgressDesc: "Which assets are surveyed, which aren't, and which have open defects.",
    pyauDashboard: "Submersible Dashboard",
    pyauDashboardDesc: "Submersibles: details, agency, contractor, faults, repairs with items, cost, photos and the ward parshad's application.",
    streetlightReports: "Street Light Reports",
    streetlightReportsDesc: "Ward-wise, street-wise, agency-wise and light-wise reports, downloadable for Excel.",
    projects: "Project Monitoring",
    projectsDesc: "Projects by stage - approval to payment - with ward-wise reports, photos, estimate / BOQ and GPS.",
    myProjects: "My Projects",
    myProjectsDesc: "Projects in your wards - site details, estimate / BOQ, progress photos and GPS points.",
    engineerWards: "Engineer Ward Assignment",
    engineerWardsDesc: "Assign wards to the JE / AE (Civil and Mechanical).",
    pyauRegistry: "Submersible Pyau Registry",
    pyauRegistryDesc: "Ward-wise water kiosk inventory, issues, and maintenance log.",
    highMastEntry: "High Mast Light Entry",
    highMastEntryDesc: "Ward-wise High Mast light inventory and installation agencies.",
    streetlights: "Streetlights",
    streetlightsDesc: "Report faults, manage the registry, and view status - everything in one place.",
    manageWards: "Manage Wards",
    manageWardsDesc: "Clean up unused/garbage wards, e.g. from a bad CSV import.",
    deactivatedStreetlights: "Deactivated Streetlights",
    deactivatedStreetlightsDesc: "Field-verify (City Manager) and delete deactivated streetlights.",
    deactivatedStaff: "Deactivated Staff",
    deactivatedStaffDesc: "Field-verify (APSWMO) and delete deactivated staff accounts.",
    correctNames: "Correct Hindi Names",
    correctNamesDesc: "Fix a wrongly auto-guessed Hindi name for a staff member, driver, or assistant.",
    faceAttendance: "Face Attendance",
    faceAttendanceDesc: "Mark Safai staff by face check, enrol faces, and review manual marks.",
    grpProjects: "Projects",
    grpProjectsDesc: "Project monitoring and the JE / AE ward assignment.",
    grpStreetlights: "Streetlights & High Mast",
    grpStreetlightsDesc: "Streetlight status and faults, reports, High Mast entry and deactivated lights.",
    grpSubmersibles: "Submersibles",
    grpSubmersiblesDesc: "Submersible dashboard and the pyau registry.",
    grpSanitation: "Sanitation Staff",
    grpSanitationDesc: "Attendance, face attendance, deactivated staff, Hindi names and wards.",
    grpFleet: "Fleet & Assets",
    grpFleetDesc: "Vehicle registry, baseline survey, survey progress and deactivated vehicles.",
    grpEnforcement: "Enforcement",
    grpEnforcementDesc: "Encroachment removal and the mobile court.",
    grpWebsite: "Website",
    grpWebsiteDesc: "Website documents and Who's Who.",
  },
  hi: {
    loading: "लोड हो रहा है...",
    welcome: "नमस्ते",
    pickModule: "नीचे से एक मॉड्यूल चुनें।",
    attendanceManagement: "अटेंडेंस प्रबंधन",
    attendanceManagementDesc: "आज का विवरण, रिपोर्ट, फ़ोटो, फीडबैक, और स्टाफ/ड्राइवर/सहायकों का प्रबंधन।",
    fleetRegistry: "फ्लीट और एसेट रजिस्ट्री",
    fleetRegistryDesc: "वाहन, ट्राइसाइकिल, हाथ-गाड़ी - स्थिति और मेंटेनेंस इतिहास।",
    deactivatedVehicles: "निष्क्रिय वाहन",
    deactivatedVehiclesDesc: "फील्ड-सत्यापन (कनिष्ठ अभियंता) करें और निष्क्रिय वाहनों को हटाएँ।",
    baselineSurvey: "फ्लीट बेसलाइन सर्वे",
    baselineSurveyDesc: "प्रत्येक वाहन/उपकरण लॉगबुक के लिए पूर्ण प्रारंभिक प्रविष्टि।",
    surveyProgress: "सर्वे प्रगति",
    surveyProgressDesc: "कौन-से एसेट सर्वे हो चुके हैं, कौन-से नहीं, और किनमें खुली खराबियाँ हैं।",
    pyauDashboard: "सबमर्सिबल डैशबोर्ड",
    pyauDashboardDesc: "सबमर्सिबल: विवरण, एजेंसी, ठेकेदार, खराबी, मरम्मत - सामान, लागत, फोटो और वार्ड पार्षद का आवेदन।",
    streetlightReports: "स्ट्रीट लाइट रिपोर्ट",
    streetlightReportsDesc: "वार्डवार, सड़कवार, एजेंसीवार और लाइटवार रिपोर्ट, Excel हेतु डाउनलोड।",
    projects: "परियोजना निगरानी",
    projectsDesc: "स्वीकृति से भुगतान तक चरणवार परियोजनाएँ - वार्डवार रिपोर्ट, फोटो, प्राक्कलन / BOQ और GPS।",
    myProjects: "मेरी परियोजनाएँ",
    myProjectsDesc: "आपके वार्डों की परियोजनाएँ - साइट विवरण, प्राक्कलन / BOQ, प्रगति फोटो और GPS।",
    engineerWards: "अभियंता वार्ड आवंटन",
    engineerWardsDesc: "कनिष्ठ / सहायक अभियंता (सिविल व यांत्रिक) को वार्ड आवंटित करें।",
    pyauRegistry: "सबमर्सिबल प्याऊ रजिस्ट्री",
    pyauRegistryDesc: "वार्ड-वार जल कियोस्क सूची, समस्याएँ, और मेंटेनेंस लॉग।",
    highMastEntry: "हाई मास्ट लाइट एंट्री",
    highMastEntryDesc: "वार्ड-वार हाई मास्ट लाइट सूची और इंस्टॉलेशन एजेंसियाँ।",
    streetlights: "स्ट्रीट लाइट्स",
    streetlightsDesc: "खराबी की रिपोर्ट करें, रजिस्ट्री प्रबंधित करें, और स्थिति देखें - सब एक ही जगह।",
    manageWards: "वार्ड प्रबंधित करें",
    manageWardsDesc: "अनुपयोगी/गलत वार्ड हटाएँ, जैसे किसी खराब CSV इम्पोर्ट से बने।",
    deactivatedStreetlights: "निष्क्रिय स्ट्रीट लाइट्स",
    deactivatedStreetlightsDesc: "फील्ड-सत्यापन (सिटी मैनेजर) करें और निष्क्रिय स्ट्रीट लाइट्स हटाएँ।",
    deactivatedStaff: "निष्क्रिय स्टाफ",
    deactivatedStaffDesc: "फील्ड-सत्यापन (एपीएसडब्ल्यूएमओ) करें और निष्क्रिय स्टाफ खाते हटाएँ।",
    correctNames: "हिंदी नाम ठीक करें",
    correctNamesDesc: "स्टाफ, ड्राइवर या सहायक के गलत ऑटो-अनुमानित हिंदी नाम को ठीक करें।",
    faceAttendance: "चेहरा हाज़िरी",
    faceAttendanceDesc: "चेहरा जाँच से सफ़ाई कर्मियों की हाज़िरी, चेहरा पंजीकरण, और मैन्युअल मार्क की समीक्षा।",
    grpProjects: "परियोजनाएँ",
    grpProjectsDesc: "परियोजना निगरानी और कनिष्ठ / सहायक अभियंता वार्ड आवंटन।",
    grpStreetlights: "स्ट्रीट लाइट व हाई मास्ट",
    grpStreetlightsDesc: "स्ट्रीट लाइट स्थिति व खराबी, रिपोर्ट, हाई मास्ट एंट्री और निष्क्रिय लाइटें।",
    grpSubmersibles: "सबमर्सिबल",
    grpSubmersiblesDesc: "सबमर्सिबल डैशबोर्ड और प्याऊ रजिस्ट्री।",
    grpSanitation: "सफ़ाई कर्मी",
    grpSanitationDesc: "हाज़िरी, चेहरा हाज़िरी, निष्क्रिय स्टाफ, हिंदी नाम और वार्ड।",
    grpFleet: "फ्लीट व एसेट",
    grpFleetDesc: "वाहन रजिस्ट्री, बेसलाइन सर्वे, सर्वे प्रगति और निष्क्रिय वाहन।",
    grpEnforcement: "प्रवर्तन",
    grpEnforcementDesc: "अतिक्रमण हटाना और मोबाइल कोर्ट।",
    grpWebsite: "वेबसाइट",
    grpWebsiteDesc: "वेबसाइट दस्तावेज़ और Who's Who।",
  },
};

const FACE_ROLES = ["sanitation_prabhari", "apswmo", "sanitation_officer", "attendance_admin"];

// Project engineers - also the older fleet / street light / pyau JE and AE logins (they are the Mechanical JE / AE there).
const ENGINEER_PROJECT_ROLES = [
  "je_civil",
  "je_mechanical",
  "ae_civil",
  "ae_mechanical",
  "junior_engineer",
  "assistant_engineer_mechanical",
  "streetlight_je",
  "streetlight_ae",
  "pyau_je",
  "pyau_ae",
];
const PROJECT_ROLES = [...ENGINEER_PROJECT_ROLES, "municipal_commissioner", "deputy_municipal_commissioner", "yojana_prabhari", "attendance_admin"];
// The submersible dashboard and street light reports (moved from the admin portal's JE / AE - Mechanical logins).
const MECH_VIEW_ROLES = ["je_mechanical", "ae_mechanical", "municipal_commissioner", "deputy_municipal_commissioner", "city_manager", "attendance_admin"];
const NAME_CORRECTION_ROLES = ["attendance_admin", "sanitation_officer", "apswmo", "sanitation_prabhari"];

export default function AttendanceDashboardPage() {
  const user = useAttendanceGuard([
    "sanitation_officer",
    "sanitation_prabhari",
    "attendance_admin",
    "junior_engineer",
    "assistant_engineer_mechanical",
    "maintenance_nodal_clerk",
    "streetlight_contractor",
    "streetlight_je",
    "streetlight_ae",
    "streetlight_nodal_clerk",
    "city_manager",
    "deputy_municipal_commissioner",
    "municipal_commissioner",
    "pyau_je",
    "pyau_ae",
    "pyau_contractor",
    "je_civil",
    "je_mechanical",
    "ae_civil",
    "ae_mechanical",
    "yojana_prabhari",
    // Mayor/Deputy Mayor/Ward Parshad (migration 084) had logins but
    // were missing from this list, so they got bounced straight back
    // to the login page before ever seeing the dashboard - including
    // the unconditional "Streetlights" hub card below, which is how
    // they reach the streetlight status view.
    "mayor",
    "deputy_mayor",
    "ward_parshad",
    // Same gap as above: apswmo had a login and an "apswmo"-gated card
    // right here on this dashboard (Deactivated Staff, and now Correct
    // Hindi Names) but wasn't in this list, so that role also bounced
    // straight back to the login page before ever reaching either one.
    "apswmo",
    // Encroachment removal (City Manager) and mobile court (APSWMO) field staff - migration 122.
    "encroachment_staff",
    "mobile_court_staff",
  ]);

  const { lang } = useAttendanceLang();
  const s = STRINGS[lang];

  if (!user) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">{s.loading}</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AttendanceHeader user={user} />

      <main className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="mb-1 text-2xl font-semibold text-slate-900">
          {s.welcome}, {lang === "hi" ? transliterateName(user.displayName) : user.displayName}
        </h1>
        <p className="mb-8 text-sm text-slate-500">{s.pickModule}</p>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {["city_manager", "municipal_commissioner", "deputy_municipal_commissioner", "attendance_admin"].includes(user.role) && <PublicComplaintsCard role={user.role} />}

          <DashboardGroup id="am-projects" title={s.grpProjects} description={s.grpProjectsDesc} icon={<HardHat className="h-6 w-6" strokeWidth={1.8} />}>
            {PROJECT_ROLES.includes(user.role) && (
              <Link href="/attendance/projects" className="flex flex-col rounded-xl border border-slate-200 bg-white p-6 transition-shadow hover:shadow-md">
                <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-nnm-blue">
                  <HardHat className="h-6 w-6" strokeWidth={1.8} />
                </span>
                <h3 className="mb-1.5 text-base font-semibold text-slate-900">{ENGINEER_PROJECT_ROLES.includes(user.role) ? s.myProjects : s.projects}</h3>
                <p className="text-sm text-slate-500">{ENGINEER_PROJECT_ROLES.includes(user.role) ? s.myProjectsDesc : s.projectsDesc}</p>
              </Link>
            )}
            {["municipal_commissioner", "attendance_admin"].includes(user.role) && (
              <Link href="/attendance/projects/engineers" className="flex flex-col rounded-xl border border-slate-200 bg-white p-6 transition-shadow hover:shadow-md">
                <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-nnm-blue">
                  <UserCog className="h-6 w-6" strokeWidth={1.8} />
                </span>
                <h3 className="mb-1.5 text-base font-semibold text-slate-900">{s.engineerWards}</h3>
                <p className="text-sm text-slate-500">{s.engineerWardsDesc}</p>
              </Link>
            )}
          </DashboardGroup>

          <DashboardGroup id="am-streetlights" title={s.grpStreetlights} description={s.grpStreetlightsDesc} icon={<Lightbulb className="h-6 w-6" strokeWidth={1.8} />}>
            <Link href="/attendance/streetlights" className="flex flex-col rounded-xl border border-slate-200 bg-white p-6 transition-shadow hover:shadow-md">
              <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-nnm-blue">
                <Lightbulb className="h-6 w-6" strokeWidth={1.8} />
              </span>
              <h3 className="mb-1.5 text-base font-semibold text-slate-900">{s.streetlights}</h3>
              <p className="text-sm text-slate-500">{s.streetlightsDesc}</p>
            </Link>
            {MECH_VIEW_ROLES.includes(user.role) && (
              <Link href="/attendance/streetlight-reports" className="flex flex-col rounded-xl border border-slate-200 bg-white p-6 transition-shadow hover:shadow-md">
                <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-nnm-blue">
                  <BarChart3 className="h-6 w-6" strokeWidth={1.8} />
                </span>
                <h3 className="mb-1.5 text-base font-semibold text-slate-900">{s.streetlightReports}</h3>
                <p className="text-sm text-slate-500">{s.streetlightReportsDesc}</p>
              </Link>
            )}
            {[
              "streetlight_nodal_clerk",
              "streetlight_ae",
              "streetlight_je",
              "je_mechanical",
              "ae_mechanical",
              "streetlight_contractor",
              "city_manager",
              "municipal_commissioner",
              "deputy_municipal_commissioner",
              "attendance_admin",
            ].includes(user.role) && (
              <Link href="/attendance/manage-lights" className="flex flex-col rounded-xl border border-slate-200 bg-white p-6 transition-shadow hover:shadow-md">
                <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-nnm-blue">
                  <Lightbulb className="h-6 w-6" strokeWidth={1.8} />
                </span>
                <h3 className="mb-1.5 text-base font-semibold text-slate-900">{s.highMastEntry}</h3>
                <p className="text-sm text-slate-500">{s.highMastEntryDesc}</p>
              </Link>
            )}
            {["municipal_commissioner", "attendance_admin"].includes(user.role) && (
              <Link href="/attendance/streetlights-deactivated" className="flex flex-col rounded-xl border border-slate-200 bg-white p-6 transition-shadow hover:shadow-md">
                <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-nnm-blue">
                  <Trash2 className="h-6 w-6" strokeWidth={1.8} />
                </span>
                <h3 className="mb-1.5 text-base font-semibold text-slate-900">{s.deactivatedStreetlights}</h3>
                <p className="text-sm text-slate-500">{s.deactivatedStreetlightsDesc}</p>
              </Link>
            )}
          </DashboardGroup>

          <DashboardGroup id="am-submersibles" title={s.grpSubmersibles} description={s.grpSubmersiblesDesc} icon={<Droplet className="h-6 w-6" strokeWidth={1.8} />}>
            {MECH_VIEW_ROLES.includes(user.role) && (
              <Link href="/attendance/submersibles" className="flex flex-col rounded-xl border border-slate-200 bg-white p-6 transition-shadow hover:shadow-md">
                <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-nnm-blue">
                  <Droplet className="h-6 w-6" strokeWidth={1.8} />
                </span>
                <h3 className="mb-1.5 text-base font-semibold text-slate-900">{s.pyauDashboard}</h3>
                <p className="text-sm text-slate-500">{s.pyauDashboardDesc}</p>
              </Link>
            )}
            {["pyau_je", "pyau_ae", "je_mechanical", "ae_mechanical", "pyau_contractor", "attendance_admin"].includes(user.role) && (
              <Link href="/attendance/manage-pyaus" className="flex flex-col rounded-xl border border-slate-200 bg-white p-6 transition-shadow hover:shadow-md">
                <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-nnm-blue">
                  <Droplet className="h-6 w-6" strokeWidth={1.8} />
                </span>
                <h3 className="mb-1.5 text-base font-semibold text-slate-900">{s.pyauRegistry}</h3>
                <p className="text-sm text-slate-500">{s.pyauRegistryDesc}</p>
              </Link>
            )}
          </DashboardGroup>

          <DashboardGroup id="am-sanitation" title={s.grpSanitation} description={s.grpSanitationDesc} icon={<LayoutGrid className="h-6 w-6" strokeWidth={1.8} />}>
            {CORE_ATTENDANCE_ROLES.includes(user.role) && (
              <Link
                href="/attendance/attendance-management"
                className="flex flex-col rounded-xl border border-slate-200 bg-white p-6 transition-shadow hover:shadow-md"
              >
                <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-nnm-blue">
                  <LayoutGrid className="h-6 w-6" strokeWidth={1.8} />
                </span>
                <h3 className="mb-1.5 text-base font-semibold text-slate-900">{s.attendanceManagement}</h3>
                <p className="text-sm text-slate-500">
                  {s.attendanceManagementDesc}
                </p>
              </Link>
            )}
            {FACE_ROLES.includes(user.role) && (
              <Link href="/attendance/face-attendance" className="flex flex-col rounded-xl border border-slate-200 bg-white p-6 transition-shadow hover:shadow-md">
                <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-nnm-blue">
                  <ScanFace className="h-6 w-6" strokeWidth={1.8} />
                </span>
                <h3 className="mb-1.5 text-base font-semibold text-slate-900">{s.faceAttendance}</h3>
                <p className="text-sm text-slate-500">{s.faceAttendanceDesc}</p>
              </Link>
            )}
            {["apswmo", "attendance_admin"].includes(user.role) && (
              <Link href="/attendance/users-deactivated" className="flex flex-col rounded-xl border border-slate-200 bg-white p-6 transition-shadow hover:shadow-md">
                <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-nnm-blue">
                  <Trash2 className="h-6 w-6" strokeWidth={1.8} />
                </span>
                <h3 className="mb-1.5 text-base font-semibold text-slate-900">{s.deactivatedStaff}</h3>
                <p className="text-sm text-slate-500">{s.deactivatedStaffDesc}</p>
              </Link>
            )}
            {NAME_CORRECTION_ROLES.includes(user.role) && (
              <Link href="/attendance/correct-names" className="flex flex-col rounded-xl border border-slate-200 bg-white p-6 transition-shadow hover:shadow-md">
                <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-nnm-blue">
                  <Languages className="h-6 w-6" strokeWidth={1.8} />
                </span>
                <h3 className="mb-1.5 text-base font-semibold text-slate-900">{s.correctNames}</h3>
                <p className="text-sm text-slate-500">{s.correctNamesDesc}</p>
              </Link>
            )}

            {user.role === "attendance_admin" && (
              <Link href="/attendance/manage-wards" className="flex flex-col rounded-xl border border-slate-200 bg-white p-6 transition-shadow hover:shadow-md">
                <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-nnm-blue">
                  <MapPin className="h-6 w-6" strokeWidth={1.8} />
                </span>
                <h3 className="mb-1.5 text-base font-semibold text-slate-900">{s.manageWards}</h3>
                <p className="text-sm text-slate-500">{s.manageWardsDesc}</p>
              </Link>
            )}
          </DashboardGroup>

          <DashboardGroup id="am-fleet" title={s.grpFleet} description={s.grpFleetDesc} icon={<Truck className="h-6 w-6" strokeWidth={1.8} />}>
            {[
              "attendance_admin",
              "junior_engineer",
              "assistant_engineer_mechanical",
              "maintenance_nodal_clerk",
              "sanitation_officer",
              "sanitation_prabhari",
            ].includes(user.role) && (
              <Link href="/attendance/manage-assets" className="flex flex-col rounded-xl border border-slate-200 bg-white p-6 transition-shadow hover:shadow-md">
                <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-nnm-blue">
                  <Truck className="h-6 w-6" strokeWidth={1.8} />
                </span>
                <h3 className="mb-1.5 text-base font-semibold text-slate-900">{s.fleetRegistry}</h3>
                <p className="text-sm text-slate-500">{s.fleetRegistryDesc}</p>
              </Link>
            )}
            {["attendance_admin", "junior_engineer", "assistant_engineer_mechanical", "maintenance_nodal_clerk"].includes(user.role) && (
              <Link href="/attendance/baseline-survey" className="flex flex-col rounded-xl border border-slate-200 bg-white p-6 transition-shadow hover:shadow-md">
                <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-nnm-blue">
                  <ClipboardList className="h-6 w-6" strokeWidth={1.8} />
                </span>
                <h3 className="mb-1.5 text-base font-semibold text-slate-900">{s.baselineSurvey}</h3>
                <p className="text-sm text-slate-500">{s.baselineSurveyDesc}</p>
              </Link>
            )}
            {["attendance_admin", "junior_engineer", "assistant_engineer_mechanical", "maintenance_nodal_clerk"].includes(user.role) && (
              <Link href="/attendance/fleet-survey-summary" className="flex flex-col rounded-xl border border-slate-200 bg-white p-6 transition-shadow hover:shadow-md">
                <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-nnm-blue">
                  <CheckCircle2 className="h-6 w-6" strokeWidth={1.8} />
                </span>
                <h3 className="mb-1.5 text-base font-semibold text-slate-900">{s.surveyProgress}</h3>
                <p className="text-sm text-slate-500">{s.surveyProgressDesc}</p>
              </Link>
            )}
            {["attendance_admin", "junior_engineer", "assistant_engineer_mechanical", "maintenance_nodal_clerk"].includes(user.role) && (
              <Link href="/attendance/assets-deactivated" className="flex flex-col rounded-xl border border-slate-200 bg-white p-6 transition-shadow hover:shadow-md">
                <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-nnm-blue">
                  <Trash2 className="h-6 w-6" strokeWidth={1.8} />
                </span>
                <h3 className="mb-1.5 text-base font-semibold text-slate-900">{s.deactivatedVehicles}</h3>
                <p className="text-sm text-slate-500">{s.deactivatedVehiclesDesc}</p>
              </Link>
            )}
          </DashboardGroup>

          <DashboardGroup id="am-enforcement" title={s.grpEnforcement} description={s.grpEnforcementDesc} icon={<ShieldAlert className="h-6 w-6" strokeWidth={1.8} />}>
            {["city_manager", "encroachment_staff", "municipal_commissioner", "deputy_municipal_commissioner"].includes(user.role) && (
              <Link href="/attendance/encroachment" className="flex flex-col rounded-xl border border-slate-200 bg-white p-6 transition-shadow hover:shadow-md">
                <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-nnm-blue">
                  <ShieldAlert className="h-6 w-6" strokeWidth={1.8} />
                </span>
                <h3 className="mb-1.5 text-base font-semibold text-slate-900">Encroachment Removal</h3>
                <p className="text-sm text-slate-500">
                  Temporary encroachments (24-hour notice, then fine) and permanent encroachment cases with notice, Amin report and final order.
                </p>
              </Link>
            )}
            {["apswmo", "mobile_court_staff", "city_manager", "municipal_commissioner", "deputy_municipal_commissioner"].includes(user.role) && (
              <Link href="/attendance/mobile-court" className="flex flex-col rounded-xl border border-slate-200 bg-white p-6 transition-shadow hover:shadow-md">
                <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-nnm-blue">
                  <Gavel className="h-6 w-6" strokeWidth={1.8} />
                </span>
                <h3 className="mb-1.5 text-base font-semibold text-slate-900">Mobile Court</h3>
                <p className="text-sm text-slate-500">
                  Notices and fines for waste-management violations, with the miking videos kept for the notices.
                </p>
              </Link>
            )}
          </DashboardGroup>

          <DashboardGroup id="am-website" title={s.grpWebsite} description={s.grpWebsiteDesc} icon={<FileUp className="h-6 w-6" strokeWidth={1.8} />}>
            {["apswmo", "city_manager", "deputy_municipal_commissioner", "municipal_commissioner"].includes(user.role) && (
              <Link href="/document-upload?as=attendance" className="flex flex-col rounded-xl border border-slate-200 bg-white p-6 transition-shadow hover:shadow-md">
                <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-nnm-blue">
                  <FileUp className="h-6 w-6" strokeWidth={1.8} />
                </span>
                <h3 className="mb-1.5 text-base font-semibold text-slate-900">{user.role === "apswmo" ? "Website Documents - Upload & Approve" : "Upload Website Document"}</h3>
                <p className="text-sm text-slate-500">
                  {user.role === "apswmo" ? "Approve documents uploaded by others, or upload your own." : user.role === "municipal_commissioner" ? "Upload a report, notice or circular to the public website." : "Upload a report, notice or circular. It goes live after APSWMO approval."}
                </p>
              </Link>
            )}
            {["city_manager", "deputy_municipal_commissioner", "municipal_commissioner"].includes(user.role) && (
              <Link href="/whos-who-manager?as=attendance" className="flex flex-col rounded-xl border border-slate-200 bg-white p-6 transition-shadow hover:shadow-md">
                <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-nnm-blue">
                  <Users className="h-6 w-6" strokeWidth={1.8} />
                </span>
                <h3 className="mb-1.5 text-base font-semibold text-slate-900">Website Who&apos;s Who</h3>
                <p className="text-sm text-slate-500">
                  {user.role === "city_manager"
                    ? "Verify Who's Who entries made by operators and forward them to the DMC."
                    : user.role === "deputy_municipal_commissioner"
                      ? "Approve verified Who's Who entries and publish them on the website."
                      : "See the Who's Who entries and where each one is in the approval chain."}
                </p>
              </Link>
            )}
          </DashboardGroup>
        </div>
      </main>
    </div>
  );
}
