# Firebase setup

The app requires Firebase configuration and a signed-in phone account. It has no public fallback workspace. Local browser data is retained and can be imported explicitly after signing in.

The supplied `gstfiling-66d45` web configuration is already included in `src/firebaseConfig.json`. It works in the production build without additional Vercel variables. Environment variables override these values if you change projects. Web config is public client configuration; no service-account key is included.

1. Create a Firebase project, register a Web app, and copy its web configuration.
2. Copy `.env.example` to `.env.local` and fill all six values. Add the same variables to your Vercel project and redeploy. These are web configuration values, not service-account secrets.
3. Enable Authentication → Sign-in method → Phone. Configure the SMS region policy to allow intended countries, including India if applicable. Add your production Vercel/custom hostname to Authorized domains. Use an authorized HTTPS hostname for real OTP; the existing LAN HTTP address may not support phone authentication. Firebase's current phone-auth documentation does not allow localhost as a hosted phone-auth domain.
4. Create the Cloud Firestore default database and a Cloud Storage bucket. Storage requires the Blaze billing plan. Check current SMS pricing before enabling real SMS.
5. Publish `firestore.rules` and `storage.rules` through the console or run `firebase deploy --only firestore:rules,storage --project YOUR_PROJECT_ID` using the Firebase CLI and your own account. Do not use open/test-mode rules.
6. Configure bucket CORS for the deployed app origin so authenticated SDK blob downloads work. Example `cors.json` below; replace the origin. Apply with `gcloud storage buckets update gs://YOUR_BUCKET --cors-file=cors.json`.

```json
[{"origin":["https://YOUR_APP.vercel.app"],"method":["GET"],"maxAgeSeconds":3600}]
```

For development, use Firebase's configured test phone numbers and fixed test codes. Do not enable app-verification bypass for a production build.

## Storage behavior

Clients are stored in `users/{uid}/clients`. Monthly dashboard metadata lives in `users/{uid}/filings`. Original Excel files and JSON snapshots are in Storage under `users/{uid}/filings`. Both rule sets restrict each account to its own UID. The app saves to cloud and shows failures instead of pretending a failed cloud save succeeded. Original uploaded files and historical snapshots are retained; storage cleanup is not automatic.

The optional import copies old browser records into the current account, skips existing cloud records, and never deletes local data. Sign out waits for queued filing writes. The account is isolated by phone login; this implementation does not add an administrator allowlist, so any phone account allowed by your Firebase project can create its own private workspace.

## Verify before deployment

Run `npm test`, `npm run lint`, and `npm run build`. Then test on the authorized deployment: SMS send/verify, incorrect and expired code, logout/login, refresh, client creation, spreadsheet upload, JSON generation/download, reopening a month on another device, and a second account being unable to access the first account's data. Real SMS, live rules, and cross-device behavior cannot be verified without your project configuration.

References: [Phone authentication](https://firebase.google.com/docs/auth/web/phone-auth), [Storage downloads and CORS](https://firebase.google.com/docs/storage/web/download-files), [Storage billing requirements](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024).
