# Admin panel setup

The `/admin` page is limited to the verified Firebase admin account configured in `src/lib/server/firebase-token.ts`. Its API never sends service credentials to the browser.

Configure these server-side environment variables in the deployment platform (and in `.env.local` for local development):

- `FIREBASE_SERVICE_ACCOUNT_JSON`: the JSON contents of a service account for the `quanticalearning` Firebase project. Grant only the Firebase Authentication user-read and Firestore read permissions needed for the export.
- `SUPABASE_SERVICE_ROLE_KEY`: the Supabase service-role key for the project identified by `NEXT_PUBLIC_SUPABASE_URL`. This key bypasses row-level security; keep it server-only and never use a `NEXT_PUBLIC_` prefix.

The Firebase export includes Authentication account metadata and all Firestore root collections and nested documents. The Supabase export includes rows from tables and views exposed through the Supabase REST API. Both sources are available in the JSON export. If one credential is missing or a source cannot be read, the panel reports that source's error instead of silently presenting an incomplete result.

After adding or changing these variables, redeploy the application. Do not commit credentials or paste them into source files or chat.
