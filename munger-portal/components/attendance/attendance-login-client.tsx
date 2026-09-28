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
    } else {
      // sanitation_officer, sanitation_prabhari, attendance_admin
      router.push("/attendance/dashboard");
    }
  }

  return <AttendanceLoginForm onSubmit={handleSubmit} />;
}
