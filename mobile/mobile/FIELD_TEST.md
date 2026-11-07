# Field test: offline capture and sync (stories 005 / 007)

Run these steps on a real Android phone, outdoors. Write the result next to each step.

Device: ______  Android version: ______  Tester: ______  Date: ______  Location: ______

## Before going out (with internet)

- [ ] Install the debug build and sign in as `AG-017`.
- [ ] Open **Map plot** and pan around the test area so the map tiles are cached.
- [ ] Home screen shows **All plots uploaded** (or 0 pending).

## Offline capture (005)

- [ ] Turn on airplane mode, but leave GPS on. The banner says **Offline — work is saved on this phone**.
- [ ] Map tiles for the cached area still show.
- [ ] The blue GPS dot appears. Write down the accuracy shown (±__ m) after 30 s in the open and under tree cover.
- [ ] Walk the plot corners and add 4 or more points with **Add GPS point**. Each tap adds a numbered marker.
- [ ] **Undo** removes the last point.
- [ ] Save the plot. The form shows the land area filled in with the mapped area. Change it, then save.
- [ ] The result dialog shows **Pending sync**. The home bar shows `1 plot(s) pending sync — will upload when online`.
- [ ] Kill the app (swipe it away), reopen it, and check that the plot is still there and still **Pending sync**.
- [ ] Map 2 more plots. Pending count = 3.
- [ ] Open a plot: check the points, accuracy, agent ID, timestamps and history.
- [ ] Edit the land area from the plot screen. History shows `land_area_updated` with old → new.

## Reconnect and sync (007)

Start the backend on a laptop on the same Wi-Fi (`docker compose up --build` in `backend/`), and build with `--dart-define=API_BASE_URL=http://<laptop-ip>:8000/api/v1`. To get a server Clean/Flagged result, upload a `WA01` baseline first (`POST /api/v1/baselines`).

- [ ] Turn off airplane mode. Within a few seconds the bar shows **Uploading…**, then **All plots uploaded · hh:mm**, with no tap needed.
- [ ] Each plot shows **Synced** and a **Synced at** time, and has a `synced` history entry with the server plot number.
- [ ] Check on the server that each plot arrived exactly once (`GET /api/v1/plots`).
- [ ] With a `WA01` baseline: the plot's result comes from the server check. Without one: the device result is kept (server says `PENDING_CHECK`).
- [ ] Save a plot with a farmer ID that is not on the server yet, for example `F-999`. It still uploads, because the farmer is created.
- [ ] Save a plot with a farmer ID that has no number, for example `ABC`. That plot stays **Pending sync** with the reason shown under the sync bar, and the other plots still upload.

## Intermittent signal

- [ ] Map 5 plots offline. Turn airplane mode off, then back on after 1–2 s, while the upload is running.
- [ ] No plot is lost: synced + pending = 5.
- [ ] Turn airplane mode off again. The rest upload. Still exactly 5 plots on the server, no duplicates.
- [ ] Walk to an area with weak signal (1 bar / EDGE). Note whether uploads finish or the bar shows `last try failed`. If it fails, tap **Sync now** when signal is better.
- [ ] Stop the API server (`docker compose stop api`) and tap **Sync now**: the bar shows `last try failed` with a network error, and plots stay **Pending sync**.

## Battery / performance (note values)

- Battery used over 1 hour of capture: ____ %
- Time for 10 plots to upload on 3G/4G: ____ s

## Issues found

| # | Step | What happened | Expected | Screenshot |
|---|------|---------------|----------|------------|
|   |      |               |          |            |
