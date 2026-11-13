import { useEffect, useState } from "react";
import { api, saveBlob } from "../api/client.js";

const QUARTERS = ["Q4 2026", "Q3 2026", "Q2 2026", "Q1 2026"];
const REGIONS = ["All Regions", "Ashanti", "Western", "Eastern", "Volta"];

export default function EudrExport() {
  const [quarter, setQuarter] = useState(QUARTERS[0]);
  const [region, setRegion] = useState(REGIONS[0]);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPreview(null);
    api.getEudrPreview({ quarter, region }).then(setPreview);
  }, [quarter, region]);

  const download = async () => {
    setBusy(true);
    try {
      saveBlob(await api.downloadEudrReport({ quarter, region }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h1 className="page-title">EUDR Export Center</h1>
      <section className="card panel export-panel">
        <h2 className="panel-title">Generate EUDR Compliance Report</h2>
        <hr />
        <p className="field-label">Select Reporting Period</p>
        <div className="select-row">
          <select className="select-lg" value={quarter} onChange={(e) => setQuarter(e.target.value)}>
            {QUARTERS.map((q) => <option key={q} value={q}>Quarter: {q}</option>)}
          </select>
          <select className="select-lg" value={region} onChange={(e) => setRegion(e.target.value)}>
            {REGIONS.map((r) => <option key={r} value={r}>Region: {r}</option>)}
          </select>
        </div>
        <hr />
        <p className="field-label">Report Preview</p>
        <dl className="preview-list">
          <div><dt>Total Compliant Plots:</dt><dd>{preview ? preview.compliantPlots.toLocaleString("en-US") : "—"}</dd></div>
          <div><dt>Total Verified Area:</dt><dd>{preview ? `${preview.verifiedAreaHa.toLocaleString("en-US")} Ha` : "—"}</dd></div>
          <div><dt>Certification Status:</dt><dd className="ok">{preview ? `[${preview.compliancePct}% Compliant]` : "—"}</dd></div>
        </dl>
        <div className="center">
          <button className="btn btn-outline-green" onClick={download} disabled={busy}>
            Download EUDR Report
          </button>
        </div>
      </section>
    </>
  );
}
