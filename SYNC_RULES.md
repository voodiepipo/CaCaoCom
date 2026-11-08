# Sync Queue and Conflict Rules (Story 007)

Owner: Nuttanun (Backend 2). Code: `src/backend/syncRules.ts`. Tests: `test/backend/syncRules.test.ts`.

These rules are for the whole team:

| Who | Task | What to follow |
|---|---|---|
| Sorawit | Connectivity listener | Start sending the queue when the network comes back (section 1) |
| Punnama | Background upload of queued records | Queue format and batch size (sections 1–2) |
| Vootichote | Retry, partial failure and duplicates | Per-item results and retry rules (sections 3–4) |

## 1. The queue on the phone

Each change the agent makes offline becomes one queue item:

```json
{
  "clientId": "6f1c2a0e-6c0b-4c1e-9a43-2b0f6a1d9e11",
  "op": "update",
  "baseVersion": 3,
  "baseValues": { "landAreaHa": 2.5 },
  "changes":    { "landAreaHa": 2.8 }
}
```

| Field | Meaning |
|---|---|
| `clientId` | UUID made on the phone when the record is created. Never changes, also on retries |
| `op` | `create`, `update` or `delete` |
| `baseVersion` | Server version the phone last saw. `null` for `create` |
| `baseValues` | Value of each changed field **before** the agent edited it (what the phone last saw) |
| `changes` | New values |

- Keep items **in the order they were made**. A create must be sent before its updates.
- Do not remove an item until the server's reply for it says `insert`, `apply` or `duplicate`.

## 2. Sending

- Send at most **50 items per request**. Send the rest in the next request.
- Use the **server's time**, not the phone's clock, for anything time-related. Phone clocks can be wrong.

## 3. Server decision for each item

The server checks each item on its own and replies with one decision. A record is **all-or-nothing**: every field is saved, or none.

| # | Situation | Decision | What the phone does |
|---|---|---|---|
| 1 | `create`, record not on server | `insert` | Remove from queue, save version 1 |
| 1 | `create`, same `clientId` already saved with the same values | `duplicate` (it was a retry) | Remove from queue |
| 1 | `create`, same `clientId` saved with different values | `conflict` | Show the server copy to the agent |
| 2 | `update`/`delete` for a record the server never saw | `reject` | Keep the item; send its `create` first |
| 3 | `delete` | `reject` | Synced plots cannot be deleted from the field app (audit trail) |
| 4 | Plot is `Under Review` or `Cleared` | `reject` | Reviewer decisions win. Show the message |
| 5 | Server already has exactly these values | `duplicate` | Remove from queue |
| 6 | `baseVersion` = server version (no one else changed it) | `apply` | Remove from queue, version + 1 |
| 7 | Someone else changed it, but **different fields** | `apply` (only the fields that still need it) | Remove from queue |
| 7 | Someone else changed **the same field** to a different value | `conflict` + field names | Server wins. Show both values to the agent |

### Example of rule 7

Server is at version 4. The phone saw version 3.

| Field | Phone saw (base) | Server now | Phone's new value | Result |
|---|---|---|---|---|
| `landAreaHa` | 2.5 | 2.5 | 2.8 | safe → apply |
| `notes` | "ok" | "fence moved" | "new fence" | both changed → **conflict** |

Because one field conflicts, **nothing is saved** for this record and the reply is `conflict: ["notes"]`.

## 4. Retries and errors (for Vootichote)

- One bad item does not fail the whole batch. Each item gets its own result.
- Network error or no reply: send the **same items again**. Rules 1 and 5 make retries safe (`duplicate`).
- `reject` and `conflict`: **do not retry automatically**. They need the agent to act.
- Invalid item shape (for example `clientId` is not a UUID): `reject` with the validation message.

## 5. Not decided yet

- The exact endpoint (`POST /api/sync`) and response format belong to Vootichote's task. Each item's result should include `clientId`, `action`, and `fields` or `reason`.
- Which fields the app can edit offline. For now: `boundary`, `landAreaHa`, `notes`, `photos`.
