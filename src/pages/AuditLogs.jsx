import { useEffect, useState } from "react";
import { api } from "../api/client.js";

const RANGES = [
  { label: "Oct 1,2023 - Oct 24, 2023", from: "2023-10-01", to: "2023-10-24" },
  { label: "Sep 1,2023 - Sep 30, 2023", from: "2023-09-01", to: "2023-09-30" },
  { label: "Last 30 days", from: "", to: "" },
];

export default function AuditLogs() {
  const [rangeIdx, setRangeIdx] = useState(0);
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], totalPages: 1 });

  useEffect(() => {
    const r = RANGES[rangeIdx];
    api.getAuditLogs({ from: r.from, to: r.to, page }).then((res) => {
      
      const localLogs = JSON.parse(localStorage.getItem("cocao_audit_logs") || "[]");
      
      
      const items = page === 1 ? [...localLogs, ...(res.items || [])] : (res.items || []);
      
      setData({
        items: items,
        totalPages: res.totalPages || 1
      });
    });
  }, [rangeIdx, page]);

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">System Audit Log</h1>
        <select
          className="pill-select wide"
          value={rangeIdx}
          onChange={(e) => { setRangeIdx(Number(e.target.value)); setPage(1); }}
        >
          {RANGES.map((r, i) => <option key={r.label} value={i}>{r.label}</option>)}
        </select>
      </div>

      <section className="card panel">
        <h2 className="panel-title">Recent Activity</h2>
        <div className="table-wrap tall">
          <table className="data-table">
            <thead>
              <tr><th>Time</th><th>User</th><th>Action</th><th>Target</th><th>Details</th></tr>
            </thead>
            <tbody>
              {data.items.map((l, i) => (
                <tr key={i}>
                  <td>{l.time}</td><td>{l.user}</td><td>{l.action}</td><td>{l.target}</td><td>{l.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="table-filler" />
        </div>

        <div className="pager">
          <button className="pg" disabled>{page}</button>
          <button className="pg" disabled={page <= 1} onClick={() => setPage(page - 1)}>&lt;</button>
          <button className="pg" disabled={page >= data.totalPages} onClick={() => setPage(page + 1)}>&gt;</button>
          <button className="pg" onClick={() => setPage(data.totalPages)}>{data.totalPages}</button>
        </div>
      </section>
    </>
  );
}