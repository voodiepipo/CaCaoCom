import { useState } from "react";

export default function DocumentVerification() {
  
  const [documentStatus, setDocumentStatus] = useState("Pending Review");
  const [actionNote, setActionNote] = useState("");

  
  const handleApprove = () => {
    setDocumentStatus("Approved");
    setActionNote("Document verified and approved successfully.");
    
  };

  
  const handleReject = () => {
    setDocumentStatus("Rejected");
    setActionNote("Document rejected due to discrepancies.");

  };

  return (
    <section className="card panel" style={{ marginTop: "20px", padding: "20px" }}>
      <h2>Land Document Verification (ID 3.2)</h2>
      <p style={{ color: "#666", marginBottom: "16px" }}>
        Review the uploaded land deed/title and verify against GPS compliance data.
      </p>

      
      <div style={{ marginBottom: "16px", padding: "10px", background: "#f8f9fa", borderRadius: "6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span><strong>Current Status:</strong></span>
        <span style={{ 
          padding: "4px 12px", 
          borderRadius: "12px", 
          fontSize: "13px", 
          fontWeight: "600",
          backgroundColor: documentStatus === "Approved" ? "#d4edda" : documentStatus === "Rejected" ? "#f8d7da" : "#fff3cd",
          color: documentStatus === "Approved" ? "#155724" : documentStatus === "Rejected" ? "#721c24" : "#856404"
        }}>
          {documentStatus}
        </span>
      </div>

      {actionNote && (
        <p style={{ fontSize: "14px", color: "#333", marginBottom: "16px", fontStyle: "italic" }}>
          Note: {actionNote}
        </p>
      )}

      
      <div style={{ border: "1px dashed #ccc", padding: "20px", textAlign: "center", marginBottom: "20px", borderRadius: "8px", background: "#fafafa" }}>
        <p style={{ fontWeight: "500", color: "#444" }}>📄 Land_Deed_Title_P394.pdf (Nor.Sor.3.Gor)</p>
        <div style={{ height: "120px", background: "#e9ecef", display: "flex", alignItems: "center", justifyContent: "center", margin: "10px 0", borderRadius: "4px", color: "#6c757d" }}>
          [ Document Viewer Preview Area ]
        </div>
      </div>

      
      <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
        <button 
          type="button" 
          className="btn" 
          onClick={handleReject}
          style={{ padding: "8px 16px", backgroundColor: "#dc3545", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer", fontWeight: "600" }}
        >
          Reject Document
        </button>
        <button 
          type="button" 
          className="btn" 
          onClick={handleApprove}
          style={{ padding: "8px 16px", backgroundColor: "#28a745", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer", fontWeight: "600" }}
        >
          Approve Document
        </button>
      </div>
    </section>
  );
}