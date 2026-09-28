"use client";

import { useRouter } from "next/navigation";
import { AttendanceLoginForm, type AttendanceLoginValues } from "./attendance-login-form";
import { attendanceLogin } from "@/lib/attendance-auth";

export function AttendanceLoginClient() {
  const router = useRouter();

  async function handleSubmit(values: AttendanceLoginValues) {
    const user = await attendanceLogin(values.username, values.password, values.rememberMe); // throws on failure - AttendanceLoginForm shows the error

    if (user.role === "jamadar") {
      router.push("/attendance/jamadar");
    } else if (user.role === "driver_supervisor") {
      router.push("/attendance/drivers");
    } else if (user.role === "ward_parshad" || user.role === "mayor" || user.role === "deputy_mayor") {
      // These three only ever report a streetlight/high-mast fault - own
      // ward for ward_parshad, any ward for mayor/deputy_mayor (the page
      // already locks the ward field when wardName is set and otherwise
      // offers every ward) - so they go straight there, skipping the
      // general dashboard they have no other use for.
      router.push("/attendance/report-streetlight-fault");
    } else {
      // sanitation_officer, sanitation_prabhari, attendance_admin, and
      // every other role with its own set of dashboard cards.
      router.push("/attendance/dashboard");
    }
  }

  return <AttendanceLoginForm onSubmit={handleSubmit} />;
}
