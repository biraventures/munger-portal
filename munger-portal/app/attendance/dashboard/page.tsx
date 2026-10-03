"use client";

import Link from "next/link";
import { LayoutGrid, Truck, Droplet, Lightbulb, MapPin, ClipboardList, CheckCircle2, Trash2, Languages } from "lucide-react";
import { AttendanceHeader } from "@/components/attendance/attendance-header";
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
  },
};

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
            <Link href="/attendance/assets-deactivated" className="flex flex-col rounded-xl border border-slate-200 bg-white p-6 transition-shadow hover:shadow-md">
              <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-nnm-blue">
                <Trash2 className="h-6 w-6" strokeWidth={1.8} />
              </span>
              <h3 className="mb-1.5 text-base font-semibold text-slate-900">{s.deactivatedVehicles}</h3>
              <p className="text-sm text-slate-500">{s.deactivatedVehiclesDesc}</p>
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

          {["pyau_je", "pyau_ae", "pyau_contractor", "attendance_admin"].includes(user.role) && (
            <Link href="/attendance/manage-pyaus" className="flex flex-col rounded-xl border border-slate-200 bg-white p-6 transition-shadow hover:shadow-md">
              <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-nnm-blue">
                <Droplet className="h-6 w-6" strokeWidth={1.8} />
              </span>
              <h3 className="mb-1.5 text-base font-semibold text-slate-900">{s.pyauRegistry}</h3>
              <p className="text-sm text-slate-500">{s.pyauRegistryDesc}</p>
            </Link>
          )}

          {[
            "streetlight_nodal_clerk",
            "streetlight_ae",
            "streetlight_je",
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

          <Link href="/attendance/streetlights" className="flex flex-col rounded-xl border border-slate-200 bg-white p-6 transition-shadow hover:shadow-md">
            <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-nnm-blue">
              <Lightbulb className="h-6 w-6" strokeWidth={1.8} />
            </span>
            <h3 className="mb-1.5 text-base font-semibold text-slate-900">{s.streetlights}</h3>
            <p className="text-sm text-slate-500">{s.streetlightsDesc}</p>
          </Link>

          {user.role === "attendance_admin" && (
            <Link href="/attendance/manage-wards" className="flex flex-col rounded-xl border border-slate-200 bg-white p-6 transition-shadow hover:shadow-md">
              <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-nnm-blue">
                <MapPin className="h-6 w-6" strokeWidth={1.8} />
              </span>
              <h3 className="mb-1.5 text-base font-semibold text-slate-900">{s.manageWards}</h3>
              <p className="text-sm text-slate-500">{s.manageWardsDesc}</p>
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
        </div>
      </main>
    </div>
  );
}
