"use client";

import { useRouter } from "next/navigation";
import { StaffLoginForm, type StaffLoginValues } from "./staff-login-form";
import { adminLogin } from "@/lib/admin-auth";

export function AdminLoginClient() {
  const router = useRouter();

  async function handleSubmit(values: StaffLoginValues) {
    await adminLogin(values.username, values.password, values.rememberMe);
    router.push("/admin/dashboard");
  }

  return (
    <StaffLoginForm
      role="admin"
      heading="Administrator Login"
      description="Municipal administrators with full system access."
      onSubmit={handleSubmit}
    />
  );
}