import { timingSafeEqual } from "node:crypto";
import {
  ADMIN_SESSION_COOKIE,
  adminSessionDurationSeconds,
  createAdminSession,
  getAdminCredentials,
  isAdminSession,
} from "@/lib/server/admin-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const responseHeaders = { "Cache-Control": "no-store" };

function sessionCookie(value: string, maxAge: number) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${ADMIN_SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

export async function GET(request: Request) {
  return Response.json(
    { authenticated: await isAdminSession(request) },
    { headers: responseHeaders },
  );
}

export async function POST(request: Request) {
  const credentials = getAdminCredentials();
  if (!credentials) {
    return Response.json(
      { error: "Admin password authentication is not configured correctly." },
      { status: 503, headers: responseHeaders },
    );
  }

  let submittedPassword: unknown;
  try {
    const body = await request.json() as { password?: unknown };
    submittedPassword = body.password;
  } catch {
    return Response.json({ error: "Invalid sign-in request." }, { status: 400, headers: responseHeaders });
  }
  if (typeof submittedPassword !== "string" || submittedPassword.length > 1024) {
    return Response.json({ error: "Invalid admin password." }, { status: 401, headers: responseHeaders });
  }

  const submitted = Buffer.from(submittedPassword);
  const expected = Buffer.from(credentials.password);
  if (submitted.length !== expected.length || !timingSafeEqual(submitted, expected)) {
    return Response.json({ error: "Invalid admin password." }, { status: 401, headers: responseHeaders });
  }

  const token = await createAdminSession(credentials.sessionSecret);
  return Response.json(
    { authenticated: true },
    {
      headers: {
        ...responseHeaders,
        "Set-Cookie": sessionCookie(token, adminSessionDurationSeconds),
      },
    },
  );
}

export async function DELETE() {
  return Response.json(
    { authenticated: false },
    {
      headers: {
        ...responseHeaders,
        "Set-Cookie": sessionCookie("", 0),
      },
    },
  );
}
