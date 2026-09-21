const TOKEN_KEY = "nnm_operator_token";
const OPERATOR_KEY = "nnm_operator_info";

export interface OperatorInfo {
  id: number;
  username: string;
  displayName: string;
  isDemo: boolean;
}

const API_BASE_URL =
  process.env.NEXT_PUBLIC_PROPERTY_TAX_API_URL || "http://localhost:4000/api/v1";

export async function operatorLogin(username: string, password: string): Promise<OperatorInfo> {
  const res = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  if (!res.ok) {
    if (res.status === 401) {
      throw new Error("Incorrect username or password.");
    }
    throw new Error("Login failed. Please try again.");
  }

  const data: { token: string; operator: OperatorInfo } = await res.json();

  // Session storage — cleared automatically when the browser tab closes.
  // A shared operator terminal shouldn't stay logged in indefinitely.
  sessionStorage.setItem(TOKEN_KEY, data.token);
  sessionStorage.setItem(OPERATOR_KEY, JSON.stringify(data.operator));

  return data.operator;
}

export function getOperatorToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(TOKEN_KEY);
}

export function getOperatorInfo(): OperatorInfo | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(OPERATOR_KEY);
  return raw ? (JSON.parse(raw) as OperatorInfo) : null;
}

export function operatorLogout(): void {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(OPERATOR_KEY);
}