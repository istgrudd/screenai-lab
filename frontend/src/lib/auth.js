/**
 * Auth utilities — JWT storage (localStorage) + decode helpers.
 *
 * The token is issued by the backend on /api/auth/login and
 * /api/auth/register. Decoded claims are: sub (user id),
 * email, role, iat, exp.
 */

const TOKEN_KEY = "screenai_lab.token";

// ── Token storage ──────────────────────────────────────────────────────────

export function saveToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function removeToken() {
  localStorage.removeItem(TOKEN_KEY);
}

// ── JWT decode ─────────────────────────────────────────────────────────────

function decodeJwt(token) {
  try {
    const payload = token.split(".")[1];
    // Convert base64url → base64 and pad
    const b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const json = atob(padded);
    return JSON.parse(decodeURIComponent(escape(json)));
  } catch {
    return null;
  }
}

/** Return claims from the stored token, or null if missing/invalid/expired. */
export function getCurrentUser() {
  const token = getToken();
  if (!token) return null;
  const claims = decodeJwt(token);
  if (!claims) return null;

  // Expired?
  if (claims.exp && claims.exp * 1000 < Date.now()) {
    removeToken();
    return null;
  }

  return {
    id: claims.sub ? Number(claims.sub) : null,
    email: claims.email || null,
    role: claims.role || null,
  };
}

export function isAuthenticated() {
  return getCurrentUser() !== null;
}

export function logout() {
  removeToken();
  window.location.assign("/login");
}

// ── Role constants (mirror backend UserRole) ──────────────────────────────

export const ROLES = {
  SUPER_ADMIN: "super_admin",
  RECRUITER: "recruiter",
  CANDIDATE: "candidate",
};

/** Default landing path after login based on role. */
export function defaultPathForRole(role) {
  if (role === ROLES.CANDIDATE) return "/dashboard";
  if (role === ROLES.RECRUITER || role === ROLES.SUPER_ADMIN) return "/";
  return "/login";
}
