# GST Helper 4.0

The app now lives directly in this project root.

## Development

Run `npm ci`, then `npm run dev` from this folder.

- `npm test` — local application tests.
- `npm run lint` — source checks.
- `npm run build` — production build in `dist`.
- `npm run preview` — preview the production build.
- `npm run test:repotic` — optional comparison requiring the original external September 2026 dataset.

## Vercel

Use the repository root as the Root Directory. The included `vercel.json` selects Vite, installs with `npm ci`, builds with `npm run build`, and serves `dist`.

Hash navigation needs no server rewrites. Clients and uploads are saved in browser storage. Local browser data does not automatically transfer to a new deployment address.

## Folders

- `src/` — app code and styles.
- `public/` — favicon.
- `tests/` — regression tests.
- `docs/` — workflow notes.
- `samples/legacy/` — original sample inputs.
- `outputs/` — retained generated JSON examples.