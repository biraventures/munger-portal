const TOKEN_KEY = "nnm_admin_token";
const ADMIN_KEY = "nnm_admin_info";

export type AdminRole =
  | "tax_daroga"
  | "tax_surveyor"
  | "tax_collector"
  | "mutation_nodal_clerk"
  | "deputy_commissioner"
  | "commissioner"
  | "stall_prabhari"
  | "city_manager"
  | "trade_license_nodal"
  | "assistant_town_planning_supervisor"
  | "assistant_architect";

export const ADMIN_ROLE_LABELS: Record<AdminRole, string> = {
  tax_daroga: "Tax Daroga",
  tax_surveyor: "Tax Surveyor",
  tax_collector: "Tax Collector",
  mutation_nodal_clerk: "Mutation Nodal Clerk",
  deputy_commissioner: "Deputy Municipal Commissioner",
  commissioner: "Municipal Commissioner",
  stall_prabhari: "Stall Prabhari",
  city_manager: "City Manager",
  trade_license_nodal: "Trade License Nodal",
  assistant_town_planning_supervisor: "Assistant Town Planning Supervisor",
  assistant_architect: "Assistant Architect",
};

export const ADMIN_ROLE_ORDER: AdminRole[] = [
  "stall_prabhari",
  "tax_daroga",
  "tax_surveyor",
  "tax_collector",
  "city_manager",
  "mutation_nodal_clerk",
  "trade_license_nodal",
  "assistant_town_planning_supervisor",
  "assistant_architect",
  "deputy_commissioner",
  "commissioner",
];

export interface AdminInfo {
  id: number;
  username: string;
  displayName: string;
  role: AdminRole;
}

const API_BASE_URL =
  process.env.NEXT_PUBLIC_PROPERTY_TAX_API_URL || "http://localhost:4000/api/v1";

export async function adminLogin(username: string, password: string): Promise<AdminInfo> {
  const res = await fetch(`${API_BASE_URL}/admin/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  if (!res.ok) {
    if (res.status === 401) throw new Error("Incorrect username or password.");
    throw new Error("Login failed. Please try again.");
  }

  const data: { token: string; admin: AdminInfo } = await res.json();
  sessionStorage.setItem(TOKEN_KEY, data.token);
  sessionStorage.setItem(ADMIN_KEY, JSON.stringify(data.admin));
  return data.admin;
}

export function getAdminToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(TOKEN_KEY);
}

export function getAdminInfo(): AdminInfo | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(ADMIN_KEY);
  return raw ? (JSON.parse(raw) as AdminInfo) : null;
}

export function adminLogout(): void {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(ADMIN_KEY);
}