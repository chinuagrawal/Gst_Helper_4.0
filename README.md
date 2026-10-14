# GST Helper 4.0

The app now lives directly in this project root.

## Development

Run `npm ci`, then `npm run dev` from this folder.

Phone OTP login and private cloud storage use the supplied `gstfiling-66d45` project configuration. Follow [Firebase setup](docs/firebase-setup.md) to enable the services and publish rules. Optional `.env.local` values override the included web configuration.

- `npm test` — local application tests.
- `npm run lint` — source checks.
- `npm run build` — production build in `dist`.
- `npm run preview` — preview the production build.
- `npm run test:repotic` — optional comparison requiring the original external September 2026 dataset.

## Vercel

Use the repository root as the Root Directory. The included `vercel.json` selects Vite, installs with `npm ci`, builds with `npm run build`, and serves `dist`.

Hash navigation needs no server rewrites. Authorize the deployed hostname in Firebase Authentication. Clients and monthly uploads are stored under the signed-in account. Existing browser data can be explicitly imported from the old origin after login.

## Folders

- `src/` — app code and styles.
- `public/` — favicon.
- `tests/` — regression tests.
- `docs/` — workflow notes.
- `samples/legacy/` — original sample inputs.
- `outputs/` — retained generated JSON examples.
