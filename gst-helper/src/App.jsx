import { useState, useRef, useCallback, useEffect } from "react";
import { parseExcelFile, detectFileByColumns, detectFilingPeriod } from "./utils/excelParser.js";
import { generateOutput, buildSummary, alignOutputOrder } from "./utils/calculator.js";
import { POS_TO_STATE, buildFP } from "./utils/constants.js";
import {
  compareToReference,
  validateOutputStructure,
} from "./utils/compare.js";
import "./App.css";
import "./theme.css";
import ThemeToggle from "./ThemeToggle.jsx";
import ClientHome from "./ClientHome.jsx";
import { filingKey, restoreFiling, saveFiling } from "./utils/filingStorage.js";
import { downloadFileName } from "./utils/filingDashboard.js";

const MONTHS = [
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" },
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
];

function getCurrentYear() {
  return new Date().getFullYear();
}

function Generator({ client, onBack, month, year, onPeriodChange }) {
  const [files, setFiles] = useState({
    tcs_sales: null,
    tcs_sales_return: null,
    Tax_invoice_details: null,
  });
  const [fileNames, setFileNames] = useState({
    tcs_sales: "",
    tcs_sales_return: "",
    Tax_invoice_details: "",
  });
  const [rows, setRows] = useState({
    tcs_sales: null,
    tcs_sales_return: null,
    Tax_invoice_details: null,
  });
  const [restored, setRestored] = useState(false);
  const [saveStatus, setSaveStatus] = useState('Loading saved uploads…');
  const [manageFiles, setManageFiles] = useState(false);
  const [output, setOutput] = useState(null);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("summary");
  const [reference, setReference] = useState(null);
  const [referenceName, setReferenceName] = useState("");
  const [comparison, setComparison] = useState(null);
  const [structureIssues, setStructureIssues] = useState([]);
  const referenceInput = useRef(null);
  const fileInputs = {
    tcs_sales: useRef(null),
    tcs_sales_return: useRef(null),
    Tax_invoice_details: useRef(null),
  };

  useEffect(() => {
    let cancelled = false;
    restoreFiling(filingKey(client.id, month, year)).then(saved => {
      if (cancelled) return;
      if (saved) {
        setFiles(saved.files); setFileNames(saved.fileNames); setRows(saved.rows);
        setOutput(saved.output); setSummary(saved.summary);
        setReference(saved.reference); setReferenceName(saved.referenceName);
        setComparison(saved.comparison); setStructureIssues(saved.structureIssues);
      }
      setRestored(true);
      setSaveStatus(saved ? 'Saved uploads restored for this month.' : 'Uploads will be saved for this month.');
    }).catch(() => {
      if (!cancelled) setSaveStatus('Unable to load saved uploads. Refresh and check browser storage.');
    });
    return () => { cancelled = true; };
  }, [client.id, month, year]);

  useEffect(() => {
    if (!restored) return;
    let cancelled = false;
    // This effect synchronizes the save indicator with the browser database.
    // eslint-disable-next-line react/set-state-in-effect
    setSaveStatus('Saving…');
    saveFiling(filingKey(client.id, month, year), {
      files, fileNames, rows, output, summary, reference, referenceName, comparison, structureIssues,
    }).then(() => {
      if (!cancelled) setSaveStatus('Saved for this month on this device.');
    }).catch(() => {
      if (!cancelled) setSaveStatus('Uploads could not be saved. Check browser storage before leaving.');
    });
    return () => { cancelled = true; };
  }, [restored, client.id, month, year, files, fileNames, rows, output,
    summary, reference, referenceName, comparison, structureIssues]);

  const fileLabels = {
    tcs_sales: "tcs_sales.xlsx",
    tcs_sales_return: "tcs_sales_return.xlsx",
    Tax_invoice_details: "Tax_invoice_details.xlsx",
  };

  const handleFileChange = useCallback(async (type, file) => {
    setError("");
    if (!file) return;
    try {
      setLoading(true);
      const parsed = await parseExcelFile(file);
      const detected = detectFileByColumns(parsed);
      if (!detected) throw new Error('The spreadsheet is empty or has unrecognized columns.');
      if (detected === 'tcs_sales' || detected === 'tcs_sales_return') {
        const period = detectFilingPeriod(parsed);
        if (period && (period.month !== month || period.year !== year)) {
          throw new Error(`Select ${MONTHS[period.month - 1].label} ${period.year} before uploading this file.`);
        }
        if (parsed.some(row => row.gstin && row.gstin !== client.gstin)) {
          throw new Error('The spreadsheet GST number does not match this client.');
        }
      }
      let finalType = type;
      if (detected && detected !== type) {
        console.warn(
          `Expected ${type} but detected ${detected}. Auto-correcting assignment.`,
        );
        finalType = detected;
      }
      setFiles((prev) => ({ ...prev, [finalType]: file }));
      setFileNames((prev) => ({ ...prev, [finalType]: file.name }));
      setRows((prev) => ({ ...prev, [finalType]: parsed }));
      setManageFiles(false);
      setOutput(null);
      setSummary(null);
      setComparison(null);
      setStructureIssues([]);
    } catch (err) {
      setError(`Error parsing ${file.name}: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [month, year, client.gstin]);

  const handleGenerate = useCallback(() => {
    setError("");
    if (!rows.tcs_sales || rows.tcs_sales.length === 0) {
      setError("Please upload tcs_sales.xlsx");
      return;
    }
    if (!rows.tcs_sales_return || rows.tcs_sales_return.length === 0) {
      setError("Please upload tcs_sales_return.xlsx");
      return;
    }
    if (!rows.Tax_invoice_details || rows.Tax_invoice_details.length === 0) {
      setError("Please upload Tax_invoice_details.xlsx");
      return;
    }
    if (!month || !year) {
      setError("Please select month and year");
      return;
    }
    try {
      setLoading(true);
      const fp = buildFP(month, year);
      const out = generateOutput(
        rows.tcs_sales,
        rows.tcs_sales_return,
        rows.Tax_invoice_details,
        fp,
        month,
        year,
        reference,
      );
      if (out.gstin !== client.gstin) {
        throw new Error(`The uploaded sales GSTIN (${out.gstin}) does not match this client (${client.gstin}).`);
      }
      const sum = buildSummary(rows.tcs_sales, rows.tcs_sales_return, out);
      const issues = validateOutputStructure(out);
      setOutput(out);
      setSummary(sum);
      setStructureIssues(issues);
      const cmp = reference ? compareToReference(out, reference) : null;
      setComparison(cmp);
      setActiveTab(cmp ? "compare" : "summary");
    } catch (err) {
      setError(`Error generating output: ${err.message}`);
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [rows, month, year, reference, client.gstin]);

  const handleReferenceChange = useCallback(
    async (file) => {
      setError("");
      if (!file) return;
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        if (validateOutputStructure(parsed).length) {
          throw new Error('The reference must contain all required Repotic sections.');
        }
        setReference(parsed);
        setReferenceName(file.name);
        if (output) {
          const aligned = alignOutputOrder(output, parsed);
          setOutput(aligned);
          const cmp = compareToReference(aligned, parsed);
          setComparison(cmp);
          setActiveTab("compare");
        }
      } catch (err) {
        setError(`Error parsing reference JSON: ${err.message}`);
        setReference(null);
        setReferenceName("");
        setComparison(null);
      }
    },
    [output],
  );

  const handleDownload = useCallback(() => {
    if (!output) return;
    const issues = validateOutputStructure(output);
    if (issues.length) {
      setError(
        "Download blocked: generated JSON is missing required Repotic sections. " +
          issues.map((i) => i.path).join(", "),
      );
      setStructureIssues(issues);
      return;
    }
    if (reference) {
      const cmp = compareToReference(output, reference);
      setComparison(cmp);
      if (!cmp.ok) {
        setError(
          `Download blocked: ${cmp.diffs.length} difference(s) vs the Repotic reference. Review the Compare tab.`,
        );
        setActiveTab("compare");
        return;
      }
    }
    const jsonStr = JSON.stringify(output);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = downloadFileName(client, output.fp);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [output, reference, client]);

  const handleReset = useCallback(() => {
    setFiles({
      tcs_sales: null,
      tcs_sales_return: null,
      Tax_invoice_details: null,
    });
    setFileNames({
      tcs_sales: "",
      tcs_sales_return: "",
      Tax_invoice_details: "",
    });
    setRows({
      tcs_sales: null,
      tcs_sales_return: null,
      Tax_invoice_details: null,
    });
    setOutput(null);
    setSummary(null);
    setError("");
    setReference(null);
    setReferenceName("");
    setComparison(null);
    setStructureIssues([]);
  }, []);

  const isReady =
    rows.tcs_sales &&
    rows.tcs_sales_return &&
    rows.Tax_invoice_details &&
    rows.tcs_sales.length > 0 &&
    rows.tcs_sales_return.length > 0 &&
    rows.Tax_invoice_details.length > 0;

  const downloadAllowed =
    output &&
    structureIssues.length === 0 &&
    (!reference || comparison?.ok);

  return (
    <div className="app">
      <header className="app-header">
        <h1>GST Repotic Output Generator</h1>
        <p className="subtitle">
          Generate exact JSON from Meesho TCS Excel files
        </p>
      </header>

      <main className="container">
        <section className="card client-context">
          <button className="btn btn-secondary" disabled={loading || saveStatus === 'Saving…'} onClick={onBack}>← All clients</button>
          <div>
            <h2>{client.tradeName}</h2>
            <p>{client.partyName} · {client.gstin} · {client.returnFrequency} return</p>
          </div>
        <div className="compact-period">
          <span className="period-title">Filing period</span>
          <div className="period-row">
            <div className="field">
              <label htmlFor="filing-month">Month</label>
              <select
                id="filing-month" value={month}
                disabled={loading || saveStatus === 'Saving…'}
                onChange={(e) => onPeriodChange(Number(e.target.value), year)}
              >
                {MONTHS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="filing-year">Year</label>
              <select
                id="filing-year" value={year}
                disabled={loading || saveStatus === 'Saving…'}
                onChange={(e) => onPeriodChange(month, Number(e.target.value))}
              >
                {Array.from(
                  { length: 7 },
                  (_, i) => getCurrentYear() - 3 + i,
                ).map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <div className="field fp-preview">
              <label>FP (filing period)</label>
              <div className="fp-value">{buildFP(month, year)}</div>
            </div>
          </div>
        </div>
        </section>
        {(!isReady || manageFiles) && <section className="card upload-section">
          <h2>Step 1: Upload Excel Files</h2>
          <div className="upload-grid">
            {Object.keys(fileLabels).map((type) => (
              <div
                key={type}
                className={`upload-box ${files[type] ? "has-file" : ""}`}
                onClick={() => restored && !loading && fileInputs[type].current?.click()}
              >
                <input
                  ref={fileInputs[type]}
                  type="file"
                  disabled={!restored || loading}
                  accept=".xlsx,.xls"
                  style={{ display: "none" }}
                  onChange={(e) => handleFileChange(type, e.target.files?.[0])}
                />
                <div className="upload-icon">📊</div>
                <div className="upload-title">{fileLabels[type]}</div>
                <div className="upload-subtitle">
                  {fileNames[type] || "Click to upload"}
                </div>
                {rows[type] && (
                  <div className="upload-status">
                    {rows[type].length} rows loaded ✓
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>}

        <section className="card action-section">
          <p className="client-storage-note" role="status">{saveStatus}</p>
          <div className="actions-row">
            {isReady && (
              <button className="btn btn-secondary" onClick={() => setManageFiles(value => !value)}
                aria-expanded={manageFiles}>
                {manageFiles ? 'Hide files' : 'Manage files'}
              </button>
            )}
            <button
              className="btn btn-primary"
              onClick={handleGenerate}
              disabled={!restored || !isReady || loading}
            >
              {loading ? "Processing..." : "⚡ Generate Output"}
            </button>
            {output && (
              <button
                className="btn btn-success"
                onClick={handleDownload}
                disabled={!downloadAllowed}
                title={
                  !downloadAllowed
                    ? "Fix missing sections or reference mismatches before download"
                    : "Download output.json"
                }
              >
                💾 Download output.json
              </button>
            )}
            <button className="btn btn-secondary" disabled={!restored || loading} onClick={handleReset}>
              🔄 Reset
            </button>
          </div>
          <div className="ref-row">
            <input
              ref={referenceInput}
              type="file"
              disabled={!restored || loading}
              accept=".json,application/json"
              style={{ display: "none" }}
              onChange={(e) => handleReferenceChange(e.target.files?.[0])}
            />
            <button
              className="btn btn-secondary"
              onClick={() => referenceInput.current?.click()}
            >
              📎 Upload Repotic reference JSON
            </button>
            <span className="ref-status">
              {referenceName
                ? `Reference: ${referenceName}`
                : "Optional: compare field-by-field before download"}
            </span>
          </div>
          {error && <div className="error-msg">❌ {error}</div>}
          {output && structureIssues.length === 0 && !reference && (
            <div className="info-msg">
              Structure complete (gstin, fp, b2cs, doc_issue, supeco, hsn).
              Upload a Repotic JSON to compare field-by-field before download.
            </div>
          )}
          {comparison && (
            <div
              className={
                comparison.blockingDiffs?.length ? "error-msg" : comparison.ok ? "ok-msg" : "info-msg"
              }
            >
              {comparison.ok
                ? "✅ Exact match against the Repotic reference."
                : comparison.blockingDiffs?.length
                  ? `❌ ${comparison.blockingDiffs.length} field difference(s) vs the Repotic reference. Download is blocked.`
                  : `Compare complete: ${comparison.diffs.length} field difference(s). Download is blocked.`}
            </div>
          )}
        </section>

        {summary && output && (
          <section className="card result-section">
            <div className="tabs">
              <button
                className={`tab ${activeTab === "summary" ? "active" : ""}`}
                onClick={() => setActiveTab("summary")}
              >
                📊 Summary
              </button>
              <button
                className={`tab ${activeTab === "b2cs" ? "active" : ""}`}
                onClick={() => setActiveTab("b2cs")}
              >
                🏪 B2CS ({summary.b2csCount})
              </button>
              <button
                className={`tab ${activeTab === "hsn" ? "active" : ""}`}
                onClick={() => setActiveTab("hsn")}
              >
                🏷️ HSN ({summary.hsnCount})
              </button>
              <button
                className={`tab ${activeTab === "eco" ? "active" : ""}`}
                onClick={() => setActiveTab("eco")}
              >
                Supplies made through E-Commerce Operators
              </button>
              <button
                className={`tab ${activeTab === "docs" ? "active" : ""}`}
                onClick={() => setActiveTab("docs")}
              >
                📄 Documents
              </button>
              <button
                className={`tab ${activeTab === "compare" ? "active" : ""}`}
                onClick={() => setActiveTab("compare")}
              >
                ✅ Compare
                {comparison
                  ? comparison.ok
                    ? " (OK)"
                    : ` (${comparison.diffs.length})`
                  : ""}
              </button>
              <button
                className={`tab ${activeTab === "json" ? "active" : ""}`}
                onClick={() => setActiveTab("json")}
              >
                🔧 JSON Preview
              </button>
            </div>

            {activeTab === "summary" && (
              <div className="tab-content">
                <div className="summary-grid">
                  <div className="sum-card">
                    <div className="sum-label">Seller GSTIN</div>
                    <div className="sum-value big">{summary.gstin}</div>
                  </div>
                  <div className="sum-card">
                    <div className="sum-label">ETIN (ECO)</div>
                    <div className="sum-value big">{summary.etin}</div>
                  </div>
                  <div className="sum-card">
                    <div className="sum-label">Filing Period</div>
                    <div className="sum-value big">{summary.fp}</div>
                  </div>
                  <div className="sum-card">
                    <div className="sum-label">Sales Rows</div>
                    <div className="sum-value">{summary.salesCount}</div>
                  </div>
                  <div className="sum-card">
                    <div className="sum-label">Return Rows</div>
                    <div className="sum-value">{summary.returnCount}</div>
                  </div>
                  <div className="sum-card">
                    <div className="sum-label">Gross Sales Taxable</div>
                    <div className="sum-value">
                      ₹{" "}
                      {summary.totalSalesTsv.toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </div>
                  </div>
                  <div className="sum-card">
                    <div className="sum-label">Less: Returns</div>
                    <div className="sum-value negative">
                      ₹{" "}
                      {summary.totalReturnTsv.toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </div>
                  </div>
                  <div className="sum-card highlight">
                    <div className="sum-label">Net Taxable (NET)</div>
                    <div className="sum-value">
                      ₹{" "}
                      {summary.netTsv.toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </div>
                  </div>
                  <div className="sum-card accent">
                    <div className="sum-label">Total B2CS Taxable Value</div>
                    <div className="sum-value">
                      ₹{" "}
                      {summary.totalTxval.toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </div>
                  </div>
                  <div className="sum-card">
                    <div className="sum-label">IGST</div>
                    <div className="sum-value">
                      ₹{" "}
                      {summary.totalIgst.toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </div>
                  </div>
                  <div className="sum-card">
                    <div className="sum-label">CGST</div>
                    <div className="sum-value">
                      ₹{" "}
                      {summary.totalCgst.toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </div>
                  </div>
                  <div className="sum-card">
                    <div className="sum-label">SGST</div>
                    <div className="sum-value">
                      ₹{" "}
                      {summary.totalSgst.toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </div>
                  </div>
                  <div className="sum-card highlight big-card">
                    <div className="sum-label">Total Tax Payable</div>
                    <div className="sum-value">
                      ₹{" "}
                      {summary.totalTax.toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </div>
                  </div>
                  <div className="sum-card">
                    <div className="sum-label">B2CS Summary Lines</div>
                    <div className="sum-value">{summary.b2csCount}</div>
                  </div>
                  <div className="sum-card">
                    <div className="sum-label">HSN Lines</div>
                    <div className="sum-value">{summary.hsnCount}</div>
                  </div>
                  <div className="sum-card">
                    <div className="sum-label">INTER / INTRA Lines</div>
                    <div className="sum-value">
                      {summary.interCount} / {summary.intraCount}
                    </div>
                  </div>
                  <div className="sum-card">
                    <div className="sum-label">Unique States (POS)</div>
                    <div className="sum-value">{summary.uniqueStatesCount}</div>
                  </div>
                  {(summary.docIssue || []).map((d) => (
                    <div className="sum-card" key={d.doc_num}>
                      <div className="sum-label">
                        {d.doc_typ} (doc_num {d.doc_num})
                      </div>
                      <div className="sum-value">
                        {d.from} → {d.to}
                      </div>
                      <div className="sum-sub">
                        totnum {d.totnum} · cancel {d.cancel} · net {d.net_issue}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === "b2cs" && (
              <div className="tab-content">
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Type</th>
                        <th>POS</th>
                        <th>State</th>
                        <th>Rate</th>
                        <th>Taxable Value</th>
                        <th>IGST</th>
                        <th>CGST</th>
                        <th>SGST</th>
                      </tr>
                    </thead>
                    <tbody>
                      {output.b2cs.map((b, i) => (
                        <tr
                          key={`${b.pos}-${b.rt}-${i}`}
                          className={
                            b.sply_ty === "INTRA" ? "row-intra" : "row-inter"
                          }
                        >
                          <td>{i + 1}</td>
                          <td>
                            <span
                              className={`badge badge-${b.sply_ty.toLowerCase()}`}
                            >
                              {b.sply_ty}
                            </span>
                          </td>
                          <td>
                            <code>{b.pos}</code>
                          </td>
                          <td>{POS_TO_STATE[b.pos] || "-"}</td>
                          <td>{b.rt}%</td>
                          <td className="num">
                            {b.txval.toLocaleString("en-IN", {
                              minimumFractionDigits: 2,
                            })}
                          </td>
                          <td className="num">
                            {b.iamt.toLocaleString("en-IN", {
                              minimumFractionDigits: 2,
                            })}
                          </td>
                          <td className="num">
                            {b.camt.toLocaleString("en-IN", {
                              minimumFractionDigits: 2,
                            })}
                          </td>
                          <td className="num">
                            {b.samt.toLocaleString("en-IN", {
                              minimumFractionDigits: 2,
                            })}
                          </td>
                        </tr>
                      ))}
                      <tr className="row-total">
                        <td colSpan="5">
                          <strong>TOTAL</strong>
                        </td>
                        <td className="num">
                          <strong>
                            {summary.totalTxval.toLocaleString("en-IN", {
                              minimumFractionDigits: 2,
                            })}
                          </strong>
                        </td>
                        <td className="num">
                          <strong>
                            {summary.totalIgst.toLocaleString("en-IN", {
                              minimumFractionDigits: 2,
                            })}
                          </strong>
                        </td>
                        <td className="num">
                          <strong>
                            {summary.totalCgst.toLocaleString("en-IN", {
                              minimumFractionDigits: 2,
                            })}
                          </strong>
                        </td>
                        <td className="num">
                          <strong>
                            {summary.totalSgst.toLocaleString("en-IN", {
                              minimumFractionDigits: 2,
                            })}
                          </strong>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === "hsn" && (
              <div className="tab-content">
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>HSN</th>
                        <th>UQC</th>
                        <th>Qty</th>
                        <th>Rate</th>
                        <th>Taxable Value</th>
                        <th>IGST</th>
                        <th>CGST</th>
                        <th>SGST</th>
                      </tr>
                    </thead>
                    <tbody>
                      {output.hsn.hsn_b2c.map((h) => (
                        <tr key={`${h.hsn_sc}-${h.uqc}-${h.rt}`}>
                          <td>{h.num}</td>
                          <td>
                            <code>{h.hsn_sc}</code>
                          </td>
                          <td>{h.uqc}</td>
                          <td className="num">{h.qty}</td>
                          <td>{h.rt}%</td>
                          <td className="num">
                            {h.txval.toLocaleString("en-IN", {
                              minimumFractionDigits: 2,
                            })}
                          </td>
                          <td className="num">
                            {h.iamt.toLocaleString("en-IN", {
                              minimumFractionDigits: 2,
                            })}
                          </td>
                          <td className="num">
                            {h.camt.toLocaleString("en-IN", {
                              minimumFractionDigits: 2,
                            })}
                          </td>
                          <td className="num">
                            {h.samt.toLocaleString("en-IN", {
                              minimumFractionDigits: 2,
                            })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === "eco" && (
              <div className="tab-content">
                <h3>14 - Supplies made through E-Commerce Operators</h3>
                <p>Liable to collect tax u/s 52 (TCS)</p>
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>GSTIN of e-commerce operator</th>
                        <th>Trade/Legal Name</th>
                        <th>Net value of supplies (₹)</th>
                        <th>Integrated tax (₹)</th>
                        <th>Central tax (₹)</th>
                        <th>State/UT tax (₹)</th>
                        <th>Cess (₹)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(output.supeco?.clttx || []).map((operator, i) => (
                        <tr key={`${operator.etin}-${i}`}>
                          <td><code>{operator.etin}</code></td>
                          <td>{operator.etin?.slice(2, 12) === "AARCM9332R"
                            ? "MEESHO TECHNOLOGIES PRIVATE LIMITED" : "—"}</td>
                          {[operator.suppval, operator.igst, operator.cgst,
                            operator.sgst, operator.cess].map((amount, index) => (
                            <td className="num" key={index}>
                              {amount.toLocaleString("en-IN", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === "docs" && (
              <div className="tab-content">
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>doc_num</th>
                        <th>doc_typ</th>
                        <th>from</th>
                        <th>to</th>
                        <th>totnum</th>
                        <th>cancel</th>
                        <th>net_issue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(output.doc_issue?.doc_det || []).map((d) => {
                        const row = d.docs?.[0] || {};
                        return (
                          <tr key={d.doc_num}>
                            <td>{d.doc_num}</td>
                            <td>{d.doc_typ}</td>
                            <td>
                              <code>{row.from || "-"}</code>
                            </td>
                            <td>
                              <code>{row.to || "-"}</code>
                            </td>
                            <td className="num">{row.totnum}</td>
                            <td className="num">{row.cancel}</td>
                            <td className="num">{row.net_issue}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === "compare" && (
              <div className="tab-content">
                {!reference && (
                  <p className="ref-status">
                    Upload a Repotic reference JSON to compare gstin, fp, b2cs,
                    doc_issue, supeco, and hsn field-by-field.
                  </p>
                )}
                {structureIssues.length > 0 && (
                  <div className="error-msg">
                    Structure issues:{" "}
                    {structureIssues.map((i) => i.path).join(", ")}
                  </div>
                )}
                {comparison && comparison.ok && (
                  <div className="ok-msg">
                    All compared fields match the Repotic reference.
                  </div>
                )}
                {comparison && comparison.diffs.length > 0 && (
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Path</th>
                          <th>Generated</th>
                          <th>Reference</th>
                        </tr>
                      </thead>
                      <tbody>
                        {comparison.diffs.map((d, i) => (
                          <tr key={`${d.path}-${i}`}>
                            <td>
                              <code>{d.path}</code>
                            </td>
                            <td>
                              {d.ours == null
                                ? "—"
                                : typeof d.ours === "object"
                                  ? JSON.stringify(d.ours)
                                  : String(d.ours)}
                            </td>
                            <td>
                              {d.ref == null
                                ? "—"
                                : typeof d.ref === "object"
                                  ? JSON.stringify(d.ref)
                                  : String(d.ref)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {activeTab === "json" && (
              <div className="tab-content">
                <div className="json-preview">
                  <pre>{JSON.stringify(output, null, 2)}</pre>
                </div>
              </div>
            )}
          </section>
        )}
      </main>

      <footer className="app-footer">
        <p>GST Repotic Output Generator · FAST React App</p>
      </footer>
    </div>
  );
}

export default function App() {
  const [selectedClient, setSelectedClient] = useState(null);
  const [period, setPeriod] = useState({ month: new Date().getMonth() + 1, year: getCurrentYear() });
  const changePeriod = (month, year) => {
    setPeriod({ month, year });
    try { localStorage.setItem(`gst-helper-period-${selectedClient.id}`, JSON.stringify({ month, year })); } catch { /* uploads use IndexedDB */ }
  };
  const openClient = (client, selectedPeriod) => {
    let next = { month: new Date().getMonth() + 1, year: getCurrentYear() };
    try {
      const saved = JSON.parse(localStorage.getItem(`gst-helper-period-${client.id}`));
      if (saved && Number.isInteger(saved.month) && saved.month >= 1 && saved.month <= 12 && Number.isInteger(saved.year)) next = saved;
    } catch { /* keep the current period */ }
    if (selectedPeriod) next = { month: selectedPeriod.month, year: selectedPeriod.year };
    try { localStorage.setItem(`gst-helper-period-${client.id}`, JSON.stringify(next)); } catch { /* optional preference */ }
    setPeriod(next);
    setSelectedClient(client);
  };
  return <><ThemeToggle />{selectedClient
    ? <Generator key={filingKey(selectedClient.id, period.month, period.year)} client={selectedClient}
        month={period.month} year={period.year} onPeriodChange={changePeriod} onBack={() => setSelectedClient(null)} />
    : <ClientHome onOpen={openClient} />}</>;
}
