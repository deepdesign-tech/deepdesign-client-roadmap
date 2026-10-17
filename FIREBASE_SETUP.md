# DeepDesign Roadmap V2 — Firebase setup

**This repository is independent of dd-approveme. Do not reuse its Firebase project.**

## Current deployment

- `index.html` remains the original local-only dashboard until Firebase is configured.
- `dashboard-v2.html` is the new Firebase-authenticated realtime dashboard.
- `firebase-config.js` contains placeholders, not credentials.
- `firestore.rules` contains the intended access rules. They must be deployed manually in Firebase Console.

## Setup

1. Create a **new Firebase project** for this roadmap (not dd-approveme).
2. Add a Web App and copy its Firebase web config values into `firebase-config.js`. The web config is public, but **never commit service account keys or passwords**.
3. Firebase Authentication → Sign-in method → enable **Email/Password**. Create staff and customer accounts in Authentication → Users. Disable self-sign-up in the UI (this app has no sign-up form); note Firebase email/password API can still allow self-sign-up, but unassigned accounts have no Firestore access.
4. Firestore Database → Create database in production mode. In Firestore Rules, paste `firestore.rules` and **Publish**.
5. Create Firestore document `projects/demo-client` with fields:
   - `name` (string): `Demo Client`
   - `phases` (map): `{}`
   - `kpi` (map): `{}`
   - `notes` (string): `\"\"` (empty string)
6. For each Firebase Authentication user, copy their **UID**. Create Firestore document `members/{UID}` with:
   - `role` (string): `admin`, `editor`, or `viewer`
   - `projects` (array of strings): `[\"demo-client\"]`
   **Only Firebase Console administrators should create or modify these member records.**
7. Authentication → Settings → Authorized domains → add `deepdesign-tech.github.io` if not already present.
8. Test `https://deepdesign-tech.github.io/deepdesign-client-roadmap/dashboard-v2.html` with two separate browsers: editor can change data, viewer sees live updates but cannot edit. Check that a user without a membership cannot read project data.
9. After tests, replace `index.html` with the verified V2 app to make it the main customer link.

## Security model

- Firebase Auth checks identity, Firestore Security Rules enforce project-level authorization and edit/view roles. **UI controls alone are not security.**
- Public GitHub Pages serves only static frontend assets; Firestore documents are not public.
- A viewer must sign in and have `members/{uid}.projects` containing the project ID.
- This starter is for controlled manual provisioning. For larger multi-client deployments, use trusted server-side administration and stricter schema validation / audit logs.
- Existing data stored in browsers via localStorage is **not migrated automatically**. Migrate only after checking it is accurate.
