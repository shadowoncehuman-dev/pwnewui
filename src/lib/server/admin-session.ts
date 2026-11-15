import { jwtVerify, SignJWT } from "jose";

export const ADMIN_SESSION_COOKIE = "zxkai-admin-session";
const SESSION_DURATION_SECONDS = 8 * 60 * 60;

export function getAdminCredentials() {
  const password = process.env.ADMIN_PASSWORD;
  const sessionSecret = process.env.ADMIN_SESSION_SECRET;
  if (!password || !sessionSecret || new TextEncoder().encode(sessionSecret).length < 32) {
    return null;
  }
  return { password, sessionSecret };
}

export async function createAdminSession(sessionSecret: string) {
  return new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(new TextEncoder().encode(sessionSecret));
}

export async function isAdminSession(request: Request) {
  const credentials = getAdminCredentials();
  if (!credentials) return false;
  const cookie = request.headers.get("cookie");
  const token = cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${ADMIN_SESSION_COOKIE}=`))
    ?.slice(ADMIN_SESSION_COOKIE.length + 1);
  if (!token) return false;

  try {
    const { payload } = await jwtVerify(
      decodeURIComponent(token),
      new TextEncoder().encode(credentials.sessionSecret),
      { algorithms: ["HS256"] },
    );
    return payload.role === "admin";
  } catch {
    return false;
  }
}

export const adminSessionDurationSeconds = SESSION_DURATION_SECONDS;
