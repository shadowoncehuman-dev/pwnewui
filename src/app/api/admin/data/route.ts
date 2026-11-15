import { isAdminSession } from "@/lib/server/admin-session";
import { exportFirebaseData } from "@/lib/server/firebase-admin-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const responseHeaders = { "Cache-Control": "no-store" };
const PAGE_SIZE = 1000;

type SupabaseSchema = {
  paths?: Record<string, { get?: unknown }>;
};

async function exportSupabaseData() {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!baseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured.");
  if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured.");

  const base = new URL(baseUrl);
  if (base.protocol !== "https:") throw new Error("Supabase URL must use HTTPS.");
  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    Accept: "application/openapi+json, application/json",
  };
  const schemaResponse = await fetch(new URL("/rest/v1/", base), { headers, cache: "no-store" });
  if (!schemaResponse.ok) throw new Error("Unable to read the Supabase API schema.");
  const schema = await schemaResponse.json() as SupabaseSchema;
  const tableNames = Object.entries(schema.paths ?? {})
    .filter(([path, operations]) => /^\/[a-zA-Z0-9_]+$/.test(path) && operations.get !== undefined)
    .map(([path]) => path.slice(1));

  const tables: Record<string, unknown[]> = {};
  for (const tableName of tableNames) {
    const rows: unknown[] = [];
    let offset = 0;
    while (true) {
      const url = new URL(`/rest/v1/${encodeURIComponent(tableName)}`, base);
      url.searchParams.set("select", "*");
      const response = await fetch(url, {
        headers: { ...headers, Range: `${offset}-${offset + PAGE_SIZE - 1}` },
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`Unable to read Supabase table ${tableName}.`);
      const page = await response.json() as unknown;
      if (!Array.isArray(page)) throw new Error(`Supabase table ${tableName} returned an invalid response.`);
      rows.push(...page);
      if (page.length < PAGE_SIZE) break;
      offset += page.length;
    }
    tables[tableName] = rows;
  }
  return { tables };
}

export async function GET(request: Request) {
  if (!await isAdminSession(request)) {
    return Response.json({ error: "Only the admin can view stored data." }, { status: 403, headers: responseHeaders });
  }

  const [firebaseResult, supabaseResult] = await Promise.allSettled([
    exportFirebaseData(),
    exportSupabaseData(),
  ]);
  const errors: { firebase?: string; supabase?: string } = {};
  if (firebaseResult.status === "rejected") {
    console.error("Unable to export Firebase data", firebaseResult.reason);
    errors.firebase = firebaseResult.reason instanceof Error
      ? firebaseResult.reason.message
      : "Unable to export Firebase data.";
  }
  if (supabaseResult.status === "rejected") {
    console.error("Unable to export Supabase data", supabaseResult.reason);
    errors.supabase = supabaseResult.reason instanceof Error
      ? supabaseResult.reason.message
      : "Unable to export Supabase data.";
  }

  return Response.json({
    firebase: firebaseResult.status === "fulfilled" ? firebaseResult.value : null,
    supabase: supabaseResult.status === "fulfilled" ? supabaseResult.value : null,
    errors,
  }, { headers: responseHeaders });
}
