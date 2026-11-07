# Cocaocom Field (mobile, Sprint 1)

Flutter app for field agents. Sprint 1 stories on the device:

- **005 Map GPS plot boundaries offline**: add points by GPS or by tapping the map, save to SQLite on the phone, marked **Pending sync**.
- **009.1 Plot vs. satellite overlap**: computed on the phone against the bundled WA01 baseline (JRC Forest Cover 2020, same polygon as `db/sample_data.sql`).
- **009.2 Flag rule**: overlap below 90% gives **Flagged**, otherwise **Clean**.
- Every save writes an append-only history entry with agent ID and timestamp.

## Sprint 2 (mobile)

- **007 Auto-sync**: `ConnectivityService` fires `reconnected` when the phone goes from no network to some network; `SyncService` then uploads queued plots one by one, oldest first, to `POST {API_BASE_URL}/api/plots/sync`. It also runs at start-up and from **Sync now** on the home screen. A failed upload stops the run and leaves the remaining plots **Pending sync** for the next try. Each plot has a `revision`, so a plot edited while its upload is in flight stays queued and the newer version is sent.
- **005 Pending sync status**: the home screen shows how many plots are only on the phone, whether they are uploading, and when the last one was sent. The plot screen shows **Synced at**.
- **3.1 Land area**: the save form has a land area field, filled in with the mapped area. On the plot screen, the pencil icon changes it. Every change adds a `land_area_updated` history entry (old → new, agent ID) and queues the plot for upload again.

Server address: `flutter run --dart-define=API_BASE_URL=http://<host>:3000`. The default is `http://10.0.2.2:3000`, which reaches the host machine from the Android emulator. The server does not have `/api/plots/sync` yet, so uploads fail and plots stay **Pending sync** until that endpoint exists.

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
