import { cert, getApps, initializeApp, type ServiceAccount } from "firebase-admin/app";
import { FieldPath, getFirestore, type CollectionReference, type DocumentData, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

const projectId = "quanticalearning";
const appName = "pwnewui-admin";
const PAGE_SIZE = 500;

type FirebaseAuthRecord = {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
  photoURL: string | null;
  disabled: boolean;
  metadata: { creationTime: string; lastSignInTime: string };
  providers: Array<{
    providerId: string;
    uid: string;
    email: string | null;
    displayName: string | null;
  }>;
};

function getAdminApp() {
  const existing = getApps().find((app) => app.name === appName);
  if (existing) return existing;

  const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!rawServiceAccount) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not configured.");

  let serviceAccount: ServiceAccount & { project_id?: string };
  try {
    serviceAccount = JSON.parse(rawServiceAccount) as ServiceAccount & { project_id?: string };
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON must contain valid service-account JSON.");
  }
  if (serviceAccount.project_id !== projectId) {
    throw new Error("Firebase service account is not configured for this project.");
  }

  return initializeApp({ credential: cert(serviceAccount), projectId }, appName);
}

function toJsonValue(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Uint8Array) return Buffer.from(value).toString("base64");
  if ("toDate" in value && typeof value.toDate === "function") return value.toDate().toISOString();
  if ("toBase64" in value && typeof value.toBase64 === "function") return value.toBase64();
  if ("path" in value && typeof value.path === "string" && "get" in value) {
    return { referencePath: value.path };
  }
  if ("latitude" in value && "longitude" in value) {
    return { latitude: value.latitude, longitude: value.longitude };
  }
  if (Array.isArray(value)) return value.map(toJsonValue);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toJsonValue(item)]));
}

export async function exportFirebaseData() {
  const app = getAdminApp();
  const authUsers: FirebaseAuthRecord[] = [];
  let pageToken: string | undefined;
  do {
    const page = await getAuth(app).listUsers(1000, pageToken);
    authUsers.push(...page.users.map((user) => ({
      uid: user.uid,
      email: user.email ?? null,
      emailVerified: user.emailVerified,
      displayName: user.displayName ?? null,
      photoURL: user.photoURL ?? null,
      disabled: user.disabled,
      metadata: {
        creationTime: user.metadata.creationTime,
        lastSignInTime: user.metadata.lastSignInTime,
      },
      providers: user.providerData.map((provider) => ({
        providerId: provider.providerId,
        uid: provider.uid,
        email: provider.email,
        displayName: provider.displayName,
      })),
    })));
    pageToken = page.pageToken;
  } while (pageToken);

  const collections: Array<{
    path: string;
    documents: Array<{ id: string; path: string; data: unknown }>;
  }> = [];
  const firestore = getFirestore(app);

  async function exportCollection(collection: CollectionReference<DocumentData>) {
    const output = { path: collection.path, documents: [] as Array<{ id: string; path: string; data: unknown }> };
    const docs: QueryDocumentSnapshot<DocumentData>[] = [];
    let cursor: QueryDocumentSnapshot<DocumentData> | undefined;

    while (true) {
      let query = collection.orderBy(FieldPath.documentId()).limit(PAGE_SIZE);
      if (cursor) query = query.startAfter(cursor);
      const page = await query.get();
      if (page.empty) break;
      docs.push(...page.docs);
      cursor = page.docs[page.docs.length - 1];
      if (page.size < PAGE_SIZE) break;
    }

    output.documents = docs.map((document) => ({
      id: document.id,
      path: document.ref.path,
      data: toJsonValue(document.data()),
    }));
    collections.push(output);

    for (const document of docs) {
      for (const subcollection of await document.ref.listCollections()) {
        await exportCollection(subcollection);
      }
    }
  }

  for (const collection of await firestore.listCollections()) {
    await exportCollection(collection);
  }

  return { authUsers, collections };
}
