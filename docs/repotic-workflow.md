# Repotic comparison workflow

Upload the three spreadsheets supplied from `D:/temp new`. The samples/legacy Excel copies contain different data. Select September 2026 before uploading. Files from a different filing period are rejected.

Upload the supplied Repotic JSON to preserve its B2CS and HSN row order. The reference controls presentation order only; all amounts and document counts come from the spreadsheets. Any comparison difference blocks download.

Run `npm run test:repotic` from the project root to check all 2,412 input rows against the reference, including exact serialized JSON equality. Set `REPOTIC_INPUT_DIR` if the supplied files move. The check writes `outputs/repotic-matched-092026.json`.

The regression also checks decimal rounding, period detection, summary reconciliation, date parsing, unknown states, changed reference values, extra document/operator records, and download blocking. Run `npm run lint` and `npm run build` for source and production checks.
