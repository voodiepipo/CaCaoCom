# Cocao.com Frontend (React + Vite)

Screens: Login, Dashboard, Farmer Profiles, Plot Verification, Audit Logs, EUDR Export.

## Run locally

Requires Node.js (18 or newer) and npm. After cloning this repository:

```bash
npm install
npm run dev
```

Vite starts a local live development server and prints its URL (normally
http://localhost:5173). Open that URL in a browser. The server reloads the page
when source files change. To expose it to other devices on the same network,
run `npm run dev -- --host 0.0.0.0`.

The project uses React modules, so opening `index.html` directly or using a
static Live Server extension is not the supported run path; use the Vite server
above. No separate JavaScript runtime command is needed.

Mock mode is enabled by default (`VITE_USE_MOCK=true` in `.env.example`), and
any email/password works. To customize local settings, copy `.env.example` to
`.env`; `.env` is ignored by Git and should not be committed.

## Production build

```bash
npm run build
npm run preview
```

The static build is written to `dist/`.

## Connect your friend's backend

## Connect your friend's backend
1. In `.env` set `VITE_API_URL=<backend url>` and `VITE_USE_MOCK=false`.
2. Open `src/api/client.js`. Every endpoint is there with a comment showing the
   expected request/response. Change paths or field names to match the backend.

| Function | Default call |
|---|---|
| login | POST /auth/login |
| getStats | GET /dashboard/stats |
| getFarmers / createFarmer | GET / POST /farmers |
| getPlot | GET /plots/:id |
| assignToAgent / approvePlot | POST /plots/:id/assign, /approve |
| getAuditLogs | GET /audit-logs?from&to&page |
| getEudrPreview | GET /eudr/preview?quarter&region |
| downloadEudrReport | GET /eudr/report (PDF blob) |

## Images
- Login background: put your photo at `public/images/forest.jpg` (a gradient shows until then).
- Plot satellite images are SVG placeholders in `src/components/PlotMap.jsx`; swap for `<img src={url}>` when the backend provides image URLs.

## Build
`npm run build` outputs static files to `dist/`.
