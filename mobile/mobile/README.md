# Cocaocom Field (mobile, Sprint 1)

Flutter app for field agents. Sprint 1 stories on the device:

- **005 Map GPS plot boundaries offline**: add points by GPS or by tapping the map, save to SQLite on the phone, marked **Pending sync**.
- **009.1 Plot vs. satellite overlap**: computed on the phone against the bundled WA01 baseline (JRC Forest Cover 2020, same polygon as `db/sample_data.sql`).
- **009.2 Flag rule**: overlap below 90% gives **Flagged**, otherwise **Clean**.
- Every save writes an append-only history entry with agent ID and timestamp.

Upload to the server (story 007) is Sprint 2.

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
