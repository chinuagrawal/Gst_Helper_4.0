# GST Helper

A client dashboard and GST JSON generator with monthly upload storage, keyboard navigation, and light/dark themes.

## Run the app

Install dependencies with `npm --prefix gst-helper install`, then run `npm run dev` from this folder. Root commands delegate to the app:

- `npm test` — local application tests.
- `npm run lint` — source checks.
- `npm run build` — production build.
- `npm run test:repotic` — optional comparison against the original external September 2026 files.

## Project folders

- `gst-helper/src/` — application screens, styles, and calculation/storage utilities.
- `gst-helper/public/` — the application favicon.
- `gst-helper/tests/` — regression tests.
- `gst-helper/docs/` — comparison workflow notes.
- `samples/legacy/` — original project spreadsheets and reference JSON files, preserved unchanged.
- `outputs/` — generated JSON files kept for reference.

The legacy samples are separate from the September comparison dataset. Client details and monthly uploads live in browser storage and are not affected by project-file cleanup.
