// ============================================================
// API layer — the ONLY file you need to edit to connect the
// frontend to your friend's backend.
//
// 1. Set VITE_API_URL and VITE_USE_MOCK=false in .env
// 2. Adjust the paths / response shapes below to match the backend.
// ============================================================

const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000/api";
const USE_MOCK = String(import.meta.env.VITE_USE_MOCK ?? "true") === "true";

const getToken = () => localStorage.getItem("cocao_token");

async function http(path, { method = "GET", body, raw = false } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const j = await res.json();
      msg = j.message || j.detail || msg;
    } catch {}
    throw new Error(msg);
  }
  return raw ? res.blob() : res.json();
}

const wait = (ms = 250) => new Promise((r) => setTimeout(r, ms));

// ------------------------ Mock data ------------------------
const mock = {
  stats: {
    totalActiveContracts: 12500,
    retention: 98.5,
    flaggedPlots: 45,
  },
  farmers: [
    { id: "#01", name: "Kofi Boateng", contract: "CT-2023-0141", plots: 3, status: "Verified", region: "Ashanti" },
    { id: "#02", name: "Ama Serwaa", contract: "CT-2023-0188", plots: 2, status: "Pending", region: "Western" },
    { id: "#03", name: "Yaw Mensah", contract: "CT-2023-0203", plots: 4, status: "Flagged", region: "Eastern" },
    { id: "#04", name: "Akosua Owusu", contract: "CT-2023-0217", plots: 1, status: "Verified", region: "Ashanti" },
    { id: "#05", name: "Kwame Asante", contract: "CT-2023-0252", plots: 5, status: "Pending", region: "Volta" },
  ],
  plot: {
    id: "P-394",
    farmer: "Kofi Boateng",
    legacyArea: 0.5,
    legacySource: "2012 Paper Registry",
    gpsArea: 2.8,
    gpsDate: "October 25,2023",
    overlap: 85,
    threshold: 90,
    mismatch: true,
  },
  audit: [
    { time: "10:30:15", user: "Kofi Boateng", action: "Approved Plot", target: "P-394", details: "(2.8 Ha)" },
    { time: "09:45:17", user: "System", action: "Data Sync", target: "Agent AGT-K76", details: "Success" },
    { time: "14:56:15", user: "System", action: "Data Sync", target: "Agent AGT-K86", details: "Success" },
  ],
  eudr: { compliantPlots: 1245, verifiedAreaHa: 3250, compliancePct: 100 },
};

// ------------------------ Endpoints ------------------------
export const api = {
  // POST /auth/login  { identifier, password } -> { token, user }
  async login(identifier, password) {
    if (USE_MOCK) {
      await wait();
      if (!identifier || !password) throw new Error("Please enter your email/Agent ID and password.");
      return { token: "mock-token", user: { name: "Kofi Boateng" } };
    }
    return http("/auth/login", { method: "POST", body: { identifier, password } });
  },

  // GET /dashboard/stats -> { totalActiveContracts, retention, flaggedPlots }
  async getStats() {
    if (USE_MOCK) { await wait(); return mock.stats; }
    return http("/dashboard/stats");
  },

  // GET /farmers?region=&status= -> [{ id, name, contract, plots, status, region }]
  async getFarmers({ region = "", status = "" } = {}) {
    if (USE_MOCK) {
      await wait();
      return mock.farmers.filter(
        (f) => (!region || f.region === region) && (!status || f.status === status)
      );
    }
    const q = new URLSearchParams({ region, status }).toString();
    return http(`/farmers?${q}`);
  },

  // POST /farmers { name, contract, region } -> farmer
  async createFarmer(data) {
    if (USE_MOCK) {
      await wait();
      const f = { id: `#0${mock.farmers.length + 1}`, plots: 0, status: "Pending", ...data };
      mock.farmers.push(f);
      return f;
    }
    return http("/farmers", { method: "POST", body: data });
  },

  // GET /plots/:id -> plot object (see mock.plot)
  async getPlot(id = "P-394") {
    if (USE_MOCK) { await wait(); return mock.plot; }
    return http(`/plots/${id}`);
  },

  // POST /plots/:id/assign
  async assignToAgent(id) {
    if (USE_MOCK) { await wait(); return { ok: true }; }
    return http(`/plots/${id}/assign`, { method: "POST" });
  },

  // POST /plots/:id/approve
  async approvePlot(id) {
    if (USE_MOCK) { await wait(); return { ok: true }; }
    return http(`/plots/${id}/approve`, { method: "POST" });
  },

  // GET /audit-logs?from=&to=&page= -> { items: [...], page, totalPages }
  async getAuditLogs({ from, to, page = 1 } = {}) {
    if (USE_MOCK) { await wait(); return { items: mock.audit, page, totalPages: 20 }; }
    const q = new URLSearchParams({ from, to, page }).toString();
    return http(`/audit-logs?${q}`);
  },

  // GET /eudr/preview?quarter=&region= -> { compliantPlots, verifiedAreaHa, compliancePct }
  async getEudrPreview({ quarter, region }) {
    if (USE_MOCK) { await wait(); return mock.eudr; }
    const q = new URLSearchParams({ quarter, region }).toString();
    return http(`/eudr/preview?${q}`);
  },

  // GET /eudr/report?quarter=&region=&plotId= -> PDF blob
  async downloadEudrReport({ quarter = "", region = "", plotId = "" } = {}) {
    let blob;
    if (USE_MOCK) {
      await wait();
      blob = new Blob(["Mock EUDR report. Connect the backend to get a real PDF."], { type: "text/plain" });
      return { blob, filename: "eudr-report-sample.txt" };
    }
    const q = new URLSearchParams({ quarter, region, plotId }).toString();
    blob = await http(`/eudr/report?${q}`, { raw: true });
    return { blob, filename: "eudr-report.pdf" };
  },
};

export function saveBlob({ blob, filename }) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
