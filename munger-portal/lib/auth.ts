import { removeAuthCookie, setAuthCookie } from "./authCookie";

const TOKEN_KEY = "nnm_operator_token";
const OPERATOR_KEY = "nnm_operator_info";

export interface OperatorInfo {
  id: number;
  username: string;
  displayName: string;
  isDemo: boolean;
}

const API_BASE_URL =
  process.env.NEXT_PUBLIC_PROPERTY_TAX_API_URL ||
  "http://localhost:4000/api/v1";

export async function operatorLogin(
  username: string,
  password: string,
  rememberMe: boolean = false,
): Promise<OperatorInfo> {
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

  sessionStorage.setItem(TOKEN_KEY, data.token);
  sessionStorage.setItem(OPERATOR_KEY, JSON.stringify(data.operator));
  setAuthCookie(data.token);

  if (rememberMe) {
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(OPERATOR_KEY, JSON.stringify(data.operator));
  } else {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(OPERATOR_KEY);
  }

  return data.operator;
}

export function getOperatorToken(): string | null {
  if (typeof window === "undefined") return null;
  const token =
    sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
  if (token && !sessionStorage.getItem(TOKEN_KEY)) {
    try {
      sessionStorage.setItem(TOKEN_KEY, token);
    } catch {}
  }
  return token;
}

export function getOperatorInfo(): OperatorInfo | null {
  if (typeof window === "undefined") return null;
  const raw =
    sessionStorage.getItem(OPERATOR_KEY) || localStorage.getItem(OPERATOR_KEY);
  if (raw && !sessionStorage.getItem(OPERATOR_KEY)) {
    try {
      sessionStorage.setItem(OPERATOR_KEY, raw);
    } catch {}
  }
  return raw ? (JSON.parse(raw) as OperatorInfo) : null;
}

export function operatorLogout(): void {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(OPERATOR_KEY);
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(OPERATOR_KEY);
  removeAuthCookie();
}
