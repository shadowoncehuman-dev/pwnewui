import { importPKCS8, SignJWT } from "jose";

const projectId = "quanticalearning";
const firestoreBase = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
const authBase = `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:batchGet`;

type ServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
};

type FirestoreValue = Record<string, unknown>;
type FirestoreDocument = {
  name: string;
  fields?: Record<string, FirestoreValue>;
};

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

function getServiceAccount(): ServiceAccount {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not configured.");

  let credentials: Partial<ServiceAccount>;
  try {
    credentials = JSON.parse(raw) as Partial<ServiceAccount>;
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON must contain valid service-account JSON.");
  }
  if (credentials.project_id !== projectId) {
    throw new Error("Firebase service account is not configured for this project.");
  }
  if (!credentials.client_email || !credentials.private_key) {
    throw new Error("Firebase service account JSON is missing its signing credentials.");
  }
  return {
    project_id: credentials.project_id,
    client_email: credentials.client_email,
    private_key: credentials.private_key,
  };
}

async function getAccessToken(credentials: ServiceAccount): Promise<string> {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedAccessToken.token;
  }

  const now = Math.floor(Date.now() / 1000);
  const privateKey = await importPKCS8(credentials.private_key.replace(/\\n/g, "\n"), "RS256");
  const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/cloud-platform" })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(credentials.client_email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(privateKey);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Unable to obtain Firebase service authorization.");

  const result = await response.json() as { access_token?: string; expires_in?: number };
  if (!result.access_token) throw new Error("Firebase authorization response did not contain an access token.");
  cachedAccessToken = {
    token: result.access_token,
    expiresAt: Date.now() + (result.expires_in ?? 3600) * 1000,
  };
  return result.access_token;
}

function decodeValue(value: FirestoreValue): unknown {
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("booleanValue" in value) return value.booleanValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("referenceValue" in value) return value.referenceValue;
  if ("bytesValue" in value) return value.bytesValue;
  if ("nullValue" in value) return null;
  if ("geoPointValue" in value) return value.geoPointValue;
  if ("arrayValue" in value) {
    const values = (value.arrayValue as { values?: FirestoreValue[] }).values ?? [];
    return values.map(decodeValue);
  }
  if ("mapValue" in value) {
    const fields = (value.mapValue as { fields?: Record<string, FirestoreValue> }).fields ?? {};
    return Object.fromEntries(Object.entries(fields).map(([key, item]) => [key, decodeValue(item)]));
  }
  return null;
}

function encodePath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/");
}

async function listCollectionIds(documentPath: string | null, token: string): Promise<string[]> {
  const suffix = documentPath ? `/${encodePath(documentPath)}` : "";
  const response = await fetch(`${firestoreBase}${suffix}:listCollectionIds`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ pageSize: 300 }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Unable to enumerate Firebase collections (HTTP ${response.status}).`);

  const collectionIds: string[] = [];
  let pageToken = "";
  let page = await response.json() as { collectionIds?: string[]; nextPageToken?: string };
  do {
    collectionIds.push(...(page.collectionIds ?? []));
    pageToken = page.nextPageToken ?? "";
    if (!pageToken) break;
    const next = await fetch(`${firestoreBase}${suffix}:listCollectionIds`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ pageSize: 300, pageToken }),
      cache: "no-store",
    });
    if (!next.ok) throw new Error(`Unable to enumerate Firebase collections (HTTP ${next.status}).`);
    page = await next.json() as { collectionIds?: string[]; nextPageToken?: string };
  } while (pageToken);
  return collectionIds;
}

async function listDocuments(collectionPath: string, token: string) {
  const documents: FirestoreDocument[] = [];
  let pageToken = "";
  do {
    const url = new URL(`${firestoreBase}/${encodePath(collectionPath)}`);
    url.searchParams.set("pageSize", "300");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Unable to read Firebase collection ${collectionPath} (HTTP ${response.status}).`);
    const page = await response.json() as { documents?: FirestoreDocument[]; nextPageToken?: string };
    documents.push(...(page.documents ?? []));
    pageToken = page.nextPageToken ?? "";
  } while (pageToken);
  return documents;
}

async function listAuthUsers(token: string) {
  const users: unknown[] = [];
  let pageToken = "";
  do {
    const url = new URL(authBase);
    url.searchParams.set("maxResults", "1000");
    if (pageToken) url.searchParams.set("nextPageToken", pageToken);
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Unable to read Firebase Authentication users (HTTP ${response.status}).`);
    const page = await response.json() as {
      users?: Array<Record<string, unknown>>;
      nextPageToken?: string;
    };
    users.push(...(page.users ?? []).map((user) => ({
      uid: user.localId,
      email: user.email ?? null,
      emailVerified: user.emailVerified ?? false,
      displayName: user.displayName ?? null,
      photoURL: user.photoUrl ?? null,
      disabled: user.disabled ?? false,
      createdAt: user.createdAt ?? null,
      lastLoginAt: user.lastLoginAt ?? null,
      providers: user.providerUserInfo ?? [],
    })));
    pageToken = page.nextPageToken ?? "";
  } while (pageToken);
  return users;
}

export async function exportFirebaseData() {
  const credentials = getServiceAccount();
  const token = await getAccessToken(credentials);
  const authUsers = await listAuthUsers(token);
  const collections: Array<{
    path: string;
    documents: Array<{ id: string; path: string; data: unknown }>;
  }> = [];

  async function exportCollection(path: string) {
    const documents = await listDocuments(path, token);
    collections.push({
      path,
      documents: documents.map((document) => {
        const documentPath = document.name.split("/documents/").pop() ?? document.name;
        return {
          id: documentPath.split("/").pop() ?? documentPath,
          path: documentPath,
          data: Object.fromEntries(Object.entries(document.fields ?? {}).map(([key, value]) => [key, decodeValue(value)])),
        };
      }),
    });

    for (const document of documents) {
      const documentPath = document.name.split("/documents/").pop();
      if (!documentPath) continue;
      for (const subcollection of await listCollectionIds(documentPath, token)) {
        await exportCollection(`${documentPath}/${subcollection}`);
      }
    }
  }

  for (const collectionId of await listCollectionIds(null, token)) {
    await exportCollection(collectionId);
  }

  return { authUsers, collections };
}
