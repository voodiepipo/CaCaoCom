import { useEffect, useState } from "react";
import { api, saveBlob } from "../api/client.js";
import PlotMap from "../components/PlotMap.jsx";

const fmt = (n) => Number(n).toLocaleString("en-US");

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [plot, setPlot] = useState(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");

  const [agents, setAgents] = useState([
    { id: "AGT-K76", name: "Kofi Boateng (Field Agent)" },
    { id: "AGT-K86", name: "Ama Mensah (Senior Inspector)" },
    { id: "AGT-K99", name: "Kwame Nkrumah (Regional Lead)" }
  ]);
  const [selectedAgent, setSelectedAgent] = useState("AGT-K76");
  
  
  const userRole = "Admin";

  useEffect(() => {
    api.getStats().then(setStats);
    api.getPlot().then(setPlot);
  }, []);

  const run = async (key, fn, okMsg) => {
    setBusy(key);
    setMsg("");
    try {
      if (fn) await fn();
      
      if (plot) {
        let actionName = "";
        let detailsText = "";

        if (key === "approve") {
          actionName = "Approved Plot";
          detailsText = `Farmer: ${plot.farmer || "Kofi Boateng"} (${plot.gpsArea || "2.8"} Ha) - Documents Verified`;
        } else if (key === "reject") {
          actionName = "Rejected Plot";
          detailsText = `Farmer: ${plot.farmer || "Kofi Boateng"} (${plot.gpsArea || "2.8"} Ha) - Document Discrepancy`;
        } else if (key === "assign") {
          actionName = "Assigned to Agent";
          detailsText = `Plot #${plot.id} -> Assigned to ${selectedAgent}`;
        }

        if (actionName) {
          const newLog = {
            time: new Date().toLocaleTimeString(),
            user: userRole, 
            action: actionName,
            target: plot.id || "P-394",
            details: detailsText
          };
          const existingLogs = JSON.parse(localStorage.getItem("cocao_audit_logs") || "[]");
          existingLogs.unshift(newLog);
          localStorage.setItem("cocao_audit_logs", JSON.stringify(existingLogs));
        }
      }

      setMsg(okMsg);
    } catch (e) {
      setMsg(e.message || "An error occurred");
    } finally {
      setBusy("");
    }
  };

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", padding: "10px 16px", background: "#f1f5f9", borderRadius: "8px", border: "1px solid #cbd5e1" }}>
        <span style={{ fontSize: "14px", fontWeight: "600", color: "#334155" }}>
          🔐 Current Permission Role: <span style={{ color: "#2563eb" }}>{userRole} (Fixed)</span>
        </span>
      </div>

      <div className="stat-row">
        <div className="card stat">
          <div className="stat-label">Total Active Contracts</div>
          <div className="stat-value">{stats ? fmt(stats.totalActiveContracts) : "—"}</div>
        </div>
        <div className="card stat">
          <div className="stat-label">Month-over-Month Retention</div>
          <div className="stat-value">{stats ? `${stats.retention}%` : "—"}</div>
        </div>
        <div className="card stat">
          <div className="stat-label">Flagged Plots</div>
          <div className="stat-value">{stats ? stats.flaggedPlots : "—"}</div>
          <div className="stat-sub">(Needs Review)</div>
        </div>
      </div>

      <section className="card panel">
        <h2 className="panel-title">Plot Verification &amp; Manual Assignment (ID 15.1)</h2>

        {plot && (
          <>
            <div className="compare-row">
              <div className="compare-box bad">
                <div className="compare-title">Legacy Paper Data</div>
                <PlotMap variant="legacy" label={`${plot.legacyArea} Ha`} />
              </div>
              <div className="compare-arrow">&gt;</div>
              <div className="compare-box good">
                <div className="compare-title">New GPS Data</div>
                <PlotMap variant="gps" label={`${plot.gpsArea} Ha`} />
              </div>
            </div>

            {plot.mismatch && <div className="alert-pill">Alert! Size Mismatch Flag</div>}

            <div className="overlap-bar">
              Satellite Overlap: {plot.overlap}% (Below {plot.threshold}% threshold - Flagged)
            </div>

            <div style={{ margin: "16px 0", padding: "14px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #cbd5e1" }}>
              <label style={{ display: "block", fontSize: "13px", fontWeight: "600", marginBottom: "6px", color: "#334155" }}>
                Select Field Agent for Manual Assignment:
              </label>
              <select
                className="pill-select wide"
                style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #94a3b8" }}
                value={selectedAgent}
                onChange={(e) => setSelectedAgent(e.target.value)}
              >
                {agents.map((ag) => (
                  <option key={ag.id} value={ag.id}>
                    {ag.name} ({ag.id})
                  </option>
                ))}
              </select>
            </div>

            <div className="action-row" style={{ marginTop: "16px", display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button
                className="btn btn-outline"
                disabled={busy === "assign"}
                onClick={() => run("assign", () => api.assignToAgent(plot.id), `Assigned plot to ${selectedAgent} successfully.`)}
              >
                Assign to Field Agent
              </button>
              
              <button
                className="btn btn-outline"
                style={{ borderColor: "#dc2626", color: "#dc2626" }}
                disabled={busy === "reject"}
                onClick={() => run("reject", null, "Documents rejected.")}
              >
                Reject Documents
              </button>

              <button
                className="btn btn-outline"
                disabled={busy === "approve"}
                onClick={() => run("approve", () => api.approvePlot(plot.id), "Documents approved.")}
              >
                Approve Documents
              </button>
            </div>

            <button
              style={{ marginTop: "12px" }}
              className="btn btn-primary btn-wide"
              disabled={busy === "dl"}
              onClick={() =>
                run("dl", async () => saveBlob(await api.downloadEudrReport({ plotId: plot.id })), "Report downloaded.")
              }
            >
              Download EUDR Compliant Report (PDF)
            </button>
            {msg && <p className="status-msg">{msg}</p>}
          </>
        )}
      </section>
    </>
  );
}