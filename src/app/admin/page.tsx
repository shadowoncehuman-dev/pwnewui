"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Database, Download, LoaderCircle, LockKeyhole, LogOut, RefreshCw, ShieldCheck } from "lucide-react";

type FirebaseExport = {
  authUsers: unknown[];
  collections: Array<{
    path: string;
    documents: Array<{ id: string; path: string; data: unknown }>;
  }>;
};

type SupabaseExport = {
  tables: Record<string, unknown[]>;
};

type AdminExport = {
  firebase: FirebaseExport | null;
  supabase: SupabaseExport | null;
  errors: { firebase?: string; supabase?: string };
};

function JsonSection({ label, value }: { label: string; value: unknown }) {
  return (
    <details className="rounded-xl border border-white/10 bg-black/10">
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold hover:bg-white/5">{label}</summary>
      <pre className="max-h-[70vh] overflow-auto border-t border-white/10 p-4 text-xs leading-5 text-muted-foreground">
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}

export default function AdminPage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [password, setPassword] = useState("");
  const [data, setData] = useState<AdminExport | null>(null);
  const [loading, setLoading] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef(0);

  const loadData = useCallback(async () => {
    const currentRequestId = ++requestId.current;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/data", {
        cache: "no-store",
      });
      const result = await response.json() as AdminExport & { error?: string };
      if (response.status === 403) throw new Error("Your admin session has expired. Sign in again.");
      if (!response.ok) throw new Error(result.error ?? "Unable to load stored data.");
      if (requestId.current === currentRequestId) setData(result);
    } catch (reason) {
      if (requestId.current === currentRequestId) {
        setData(null);
        setError(reason instanceof Error ? reason.message : "Unable to load stored data.");
      }
    } finally {
      if (requestId.current === currentRequestId) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void fetch("/api/admin/auth", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to check admin session.");
        return response.json() as Promise<{ authenticated: boolean }>;
      })
      .then(({ authenticated: hasSession }) => {
        if (!active) return;
        setAuthenticated(hasSession);
        if (hasSession) void loadData();
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Unable to check admin session.");
      })
      .finally(() => {
        if (active) setCheckingSession(false);
      });
    return () => {
      active = false;
      requestId.current += 1;
    };
  }, [loadData]);

  async function handleSignIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSigningIn(true);
    setError("");
    try {
      const response = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to sign in.");
      setAuthenticated(true);
      setPassword("");
      await loadData();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to sign in.");
    } finally {
      setSigningIn(false);
    }
  }

  async function handleSignOut() {
    setError("");
    try {
      const response = await fetch("/api/admin/auth", { method: "DELETE" });
      if (!response.ok) throw new Error("Unable to sign out.");
      requestId.current += 1;
      setAuthenticated(false);
      setData(null);
      setLoading(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to sign out.");
    }
  }

  function exportData() {
    if (!data) return;
    const file = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = `zxkai-database-export-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const firebaseRecordCount = data?.firebase
    ? data.firebase.authUsers.length + data.firebase.collections.reduce((total, item) => total + item.documents.length, 0)
    : 0;
  const supabaseTableCount = data?.supabase ? Object.keys(data.supabase.tables).length : 0;
  const supabaseRecordCount = data?.supabase
    ? Object.values(data.supabase.tables).reduce((total, rows) => total + rows.length, 0)
    : 0;

  return (
    <main className="min-h-screen px-4 py-10 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#7cc0ff]">ZXkai administration</p>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">Database admin panel</h1>
          </div>
          {authenticated && (
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={() => void loadData()} disabled={loading} className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-semibold transition-colors hover:bg-white/10 disabled:opacity-50">
                {loading ? <LoaderCircle size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                Refresh
              </button>
              <button type="button" onClick={exportData} disabled={!data} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#e7bd6d] px-4 text-sm font-bold text-[#16130c] transition-colors hover:bg-[#f0cc83] disabled:opacity-50">
                <Download size={16} /> Export all JSON
              </button>
              <button type="button" onClick={() => void handleSignOut()} className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-semibold transition-colors hover:bg-white/10">
                <LogOut size={16} /> Sign out
              </button>
            </div>
          )}
        </header>

        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-7">
          {checkingSession ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <LoaderCircle size={16} className="animate-spin" /> Checking admin session…
            </div>
          ) : !authenticated ? (
            <div className="mx-auto flex max-w-md flex-col items-center py-12 text-center">
              <LockKeyhole size={32} className="text-[#e7bd6d]" />
              <h2 className="mt-4 text-xl font-bold">Admin sign-in required</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">Enter the admin password to view database records.</p>
              <form onSubmit={handleSignIn} className="mt-6 flex w-full flex-col gap-3">
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  aria-label="Admin password"
                  placeholder="Admin password"
                  className="h-12 rounded-xl border border-white/10 bg-black/20 px-4 text-sm outline-none transition-colors focus:border-[#e7bd6d]"
                />
                <button type="submit" disabled={signingIn} className="rounded-xl bg-[#e7bd6d] px-5 py-3 text-sm font-bold text-[#16130c] transition-colors hover:bg-[#f0cc83] disabled:opacity-50">
                  {signingIn ? "Signing in…" : "Sign in"}
                </button>
              </form>
              {error && <p role="alert" className="mt-4 text-sm text-red-200">{error}</p>}
            </div>
          ) : (
            <>
              <div className="mb-5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                {loading ? <LoaderCircle size={16} className="animate-spin" /> : <Database size={16} />}
                {loading ? "Loading Firebase and Supabase data…" : "Database data"}
                <span className="ml-auto inline-flex items-center gap-1 text-xs"><ShieldCheck size={14} /> Admin access</span>
              </div>
              <p className="mb-6 text-xs leading-5 text-muted-foreground">
                This panel includes Firebase Authentication accounts, Firestore documents and subcollections, plus Supabase REST tables/views. Secrets and access tokens are never included in exports.
              </p>

              {error && <p role="alert" className="mb-5 rounded-xl border border-red-300/20 bg-red-400/5 px-4 py-3 text-sm text-red-100">{error}</p>}
              {data?.errors.firebase && <p role="alert" className="mb-3 rounded-xl border border-amber-200/20 bg-amber-200/5 px-4 py-3 text-sm text-amber-100">Firebase: {data.errors.firebase}</p>}
              {data?.errors.supabase && <p role="alert" className="mb-5 rounded-xl border border-amber-200/20 bg-amber-200/5 px-4 py-3 text-sm text-amber-100">Supabase: {data.errors.supabase}</p>}

              <div className="grid gap-6 lg:grid-cols-2">
                <section className="min-w-0 space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold">Firebase</h2>
                    <span className="text-xs text-muted-foreground">{data?.firebase ? `${firebaseRecordCount} records` : "Unavailable"}</span>
                  </div>
                  {data?.firebase ? (
                    <>
                      <JsonSection label={`Authentication accounts (${data.firebase.authUsers.length})`} value={data.firebase.authUsers} />
                      {data.firebase.collections.map((collection) => (
                        <JsonSection key={collection.path} label={`${collection.path} (${collection.documents.length} documents)`} value={collection.documents} />
                      ))}
                      {data.firebase.collections.length === 0 && data.firebase.authUsers.length === 0 && <p className="text-sm text-muted-foreground">No Firebase records found.</p>}
                    </>
                  ) : !data?.errors.firebase ? (
                    <p className="text-sm text-muted-foreground">{loading ? "Loading…" : "No data loaded."}</p>
                  ) : null}
                </section>

                <section className="min-w-0 space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold">Supabase</h2>
                    <span className="text-xs text-muted-foreground">{data?.supabase ? `${supabaseTableCount} tables · ${supabaseRecordCount} rows` : "Unavailable"}</span>
                  </div>
                  {data?.supabase ? (
                    <>
                      {Object.entries(data.supabase.tables).map(([table, rows]) => (
                        <JsonSection key={table} label={`${table} (${rows.length} rows)`} value={rows} />
                      ))}
                      {supabaseTableCount === 0 && <p className="text-sm text-muted-foreground">No accessible tables or views found.</p>}
                    </>
                  ) : !data?.errors.supabase ? (
                    <p className="text-sm text-muted-foreground">{loading ? "Loading…" : "No data loaded."}</p>
                  ) : null}
                </section>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
