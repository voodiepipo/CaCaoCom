import { useEffect, useState } from "react";
import { api } from "../api/client.js";

const REGIONS = ["Ashanti", "Western", "Eastern", "Volta"];
const STATUSES = ["Verified", "Pending", "Flagged"];

export default function FarmerProfiles() {
  const [region, setRegion] = useState("");
  const [status, setStatus] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", contract: "", region: REGIONS[0] });

  const load = () => {
    setLoading(true);
    api.getFarmers({ region, status }).then(setRows).finally(() => setLoading(false));
  };
  useEffect(load, [region, status]);

  const create = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    await api.createFarmer(form);
    setForm({ name: "", contract: "", region: REGIONS[0] });
    setShowForm(false);
    load();
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Farmer Profiles &amp; Registry Records</h1>
          <h2 className="page-sub">Farmer Profiles</h2>
        </div>
        <button className="btn btn-primary btn-focus" onClick={() => setShowForm(true)}>
          + Register New Farmer Profile
        </button>
      </div>

      <section className="card panel">
        <div className="filter-row">
          <span>Filled by:</span>
          <select className="pill-select" value={region} onChange={(e) => setRegion(e.target.value)}>
            <option value="">All Regions</option>
            {REGIONS.map((r) => <option key={r}>{r}</option>)}
          </select>
          <select className="pill-select" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All Status</option>
            {STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Farmer ID</th>
                <th>Farmer Name</th>
                <th>Contract Info</th>
                <th>No.of Plots</th>
                <th>Verification Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((f) => (
                <tr key={f.id}>
                  <td>{f.id}</td>
                  <td>{f.name}</td>
                  <td>{f.contract}</td>
                  <td>{f.plots}</td>
                  <td><span className={`badge ${f.status.toLowerCase()}`}>{f.status}</span></td>
                </tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr><td colSpan="5" className="empty">No farmers match these filters.</td></tr>
              )}
            </tbody>
          </table>
          <div className="table-filler" />
        </div>
      </section>

      {showForm && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={create}>
            <h3>Register New Farmer Profile</h3>
            <label>Farmer Name</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
            <label>Contract Info</label>
            <input value={form.contract} onChange={(e) => setForm({ ...form, contract: e.target.value })} />
            <label>Region</label>
            <select value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })}>
              {REGIONS.map((r) => <option key={r}>{r}</option>)}
            </select>
            <div className="modal-actions">
              <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Save</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
