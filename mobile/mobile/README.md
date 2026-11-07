# Cocaocom Field (mobile, Sprint 1)

Flutter app for field agents. Sprint 1 stories on the device:

- **005 Map GPS plot boundaries offline**: add points by GPS or by tapping the map, save to SQLite on the phone, marked **Pending sync**.
- **009.1 Plot vs. satellite overlap**: computed on the phone against the bundled WA01 baseline (JRC Forest Cover 2020, same polygon as `db/sample_data.sql`).
- **009.2 Flag rule**: overlap below 90% gives **Flagged**, otherwise **Clean**.
- Every save writes an append-only history entry with agent ID and timestamp.

## Sprint 2 (mobile)

- **007 Auto-sync**: `ConnectivityService` fires `reconnected` when the phone goes from no network to some network; `SyncService` then uploads queued plots one by one, oldest first, to `POST {API_BASE_URL}/plots` on the FastAPI backend ([backend/](../../backend/)). It also runs at start-up and from **Sync now** on the home screen.
  - Each plot is sent with a `client_id` (a UUID derived from its local ID), so the server ignores repeats and a retried upload never creates a second plot.
  - A network error or 5xx stops the run and leaves the remaining plots **Pending sync** for the next try. A 4xx means the server rejected that plot: it is skipped for this run and the rest of the queue continues. The reason shows under the sync bar.
  - If the farmer ID is not on the server yet, the app creates the farmer and sends the plot again.
  - The server's overlap check replaces the device check once a baseline exists for the region. Without one the server answers `PENDING_CHECK` and the device result is kept.
  - Each plot has a `revision`, so a plot edited while its upload is in flight is not marked synced by mistake.
- **005 Pending sync status**: the home screen shows how many plots are only on the phone, whether they are uploading, and when the last one was sent. The plot screen shows **Synced at**.
- **3.1 Land area**: the save form has a land area field, filled in with the mapped area. On the plot screen, the pencil icon changes it. Every change adds a `land_area_updated` history entry (old → new, agent ID) and puts the plot back to **Pending sync**. **Known gap:** the upload does not send land area, the backend has no land area field yet, and re-sending a plot with the same `client_id` doesn't change it on the server. So a land area edit is kept on the phone only, even though the plot shows **Synced** after the next sync.

Server: start the backend with `docker compose up --build` in [backend/](../../backend/) (API on port 8000). Then `flutter run --dart-define=API_BASE_URL=http://<host>:8000/api/v1`. The default is `http://10.0.2.2:8000/api/v1`, which reaches the host machine from the Android emulator. For the server overlap check to give Clean/Flagged, upload a baseline for region `WA01` with `POST /api/v1/baselines`.

Field test checklist: [FIELD_TEST.md](FIELD_TEST.md).

## Run

Open this folder in Android Studio, start an emulator or plug in an Android phone, then press Run. Or:

```bash
flutter pub get
flutter run
flutter test
```

## Demo script (about 2 minutes)

1. Sign in with Agent ID `AG-017`.
2. Turn on airplane mode. The banner shows **Offline**.
3. Tap **Map plot**. The green circle is the 2020 forest baseline.
4. Tap 4 points **inside** the circle, then **Save**. Result: **Clean**, 100%, **Pending sync**.
5. Map a second plot mostly **outside** the circle. Result: **Flagged** with the overlap %.
6. Open a plot to show the points, agent ID, timestamps and the read-only history.

Map tiles show offline only for areas viewed once while online, so open the capture screen once before the meeting with internet on.
