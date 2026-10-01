const AUTH_COOKIE_KEY = "nnm_operator_auth";

const ONE_YEAR_IN_SECONDS = 365 * 24 * 60 * 60;

export function setAuthCookie(token: string): void {
  document.cookie = [
    `${AUTH_COOKIE_KEY}=${encodeURIComponent(token)}`,
    `Max-Age=${ONE_YEAR_IN_SECONDS}`,
    "Path=/",
    "SameSite=Strict",
    ...(window.location.protocol === "https:" ? ["Secure"] : []),
  ].join("; ");
}

export function removeAuthCookie(): void {
  document.cookie = [
    `${AUTH_COOKIE_KEY}=`,
    "Max-Age=0",
    "Path=/",
    "SameSite=Lax",
  ].join("; ");
}
