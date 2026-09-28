"use client";

import { useRouter } from "next/navigation";
import { StaffLoginForm, type StaffLoginValues } from "./staff-login-form";
import { operatorLogin } from "@/lib/auth";

export function OperatorLoginClient() {
  const router = useRouter();

  async function handleSubmit(values: StaffLoginValues) {
    await operatorLogin(values.username, values.password, values.rememberMe); // throws on failure — StaffLoginForm shows the error
    router.push("/operator/dashboard");
  }

  return (
    <StaffLoginForm
      role="operator"
      heading="Operator Login"
      description="Municipal staff and data entry operators."
      onSubmit={handleSubmit}
    />
  );
}