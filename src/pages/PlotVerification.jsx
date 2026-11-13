import { useEffect, useState } from "react";
import { api, saveBlob } from "../api/client.js";
import PlotMap from "../components/PlotMap.jsx";

export default function PlotVerification() {
  const [plot, setPlot] = useState(null);
  const [busy, setBusy] = useState(false);
  
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [saveStatus, setSaveStatus] = useState("");

  useEffect(() => {
    api.getPlot().then(setPlot);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const handleSaveOffline = () => {
    if (!plot) return;
    
    const offlinePlotData = {
      plotId: plot.id,
      farmer: plot.farmer,
      gpsArea: plot.gpsArea,
      timestamp: new Date().toISOString(),
      status: "Pending Sync"
    };

    const existingOfflineData = JSON.parse(localStorage.getItem("offline_plots") || "[]");
    existingOfflineData.push(offlinePlotData);
    localStorage.setItem("offline_plots", JSON.stringify(existingOfflineData));

    setSaveStatus("Saved offline successfully! Ready to sync.");
    setTimeout(() => setSaveStatus(""), 4000);
  };

  if (!plot) return <p className="status-msg">Loading plot…</p>;

  const download = async () => {
    setBusy(true);
    try {
      saveBlob(await api.downloadEudrReport({ plotId: plot.id }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h1 className="page-title">Plot Verification &amp; Compliance Center</h1>
      
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", padding: "8px 16px", background: "#f8f9fa", borderRadius: "8px", border: "1px solid #dee2e6" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ 
            width: "10px", 
            height: "10px", 
            borderRadius: "50%", 
            backgroundColor: isOnline ? "#28a745" : "#ffc107",
            display: "inline-block" 
          }} />
          <span style={{ fontSize: "14px", fontWeight: "600", color: "#333" }}>
            {isOnline ? "Online Mode (Connected)" : "Offline Mode Ready (No Internet)"}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {saveStatus && <span style={{ fontSize: "13px", color: "#28a745", fontWeight: "500" }}>{saveStatus}</span>}
          <button 
            type="button" 
            className="btn btn-secondary" 
            onClick={handleSaveOffline}
            style={{ padding: "6px 14px", fontSize: "13px", cursor: "pointer", backgroundColor: "#6c757d", color: "#fff", border: "none", borderRadius: "4px" }}
          >
            Save Offline Plot
          </button>
        </div>
      </div>

      <section className="card panel">
        <p className="verify-for">Verification for : Plot #{plot.id} (Farmer: {plot.farmer})</p>
        {plot.mismatch && <div className="alert-bar">Alert! Size Mismatch Flag: New GPS Area</div>}

        
        <div className="two-col" style={{ display: "flex", justifyContent: "space-around", gap: "20px", margin: "20px 0" }}>
          <div className="col" style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
            <h3>Legacy Paper Data</h3>
            <div style={{ width: "100%", display: "flex", justifyContent: "center" }}>
              <PlotMap variant="legacy" className="plain" />
            </div>
            <p style={{ marginTop: "10px" }}>Area: {plot.legacyArea} Ha</p>
            <p>{plot.legacySource}</p>
          </div>
          
          <div className="col" style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
            <h3>New GPS Data</h3>
            <div style={{ width: "100%", display: "flex", justifyContent: "center" }}>
              <PlotMap variant="gps" className="plain" />
            </div>
            <p style={{ marginTop: "10px" }}>Area: {plot.gpsArea} Ha</p>
            <p>Date: {plot.gpsDate}</p>
          </div>
        </div>

        <div className="center" style={{ display: "flex", justifyContent: "center", marginTop: "20px" }}>
          <button className="btn btn-primary" onClick={download} disabled={busy}>
            Download EU Compliant Report (PDF)
          </button>
        </div>
      </section>
    </>
  );
}