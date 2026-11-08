import { currentThreshold } from "./flagging.ts";
import { createBackendServer } from "./routes.ts";

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new RangeError("PORT must be an integer between 1 and 65535");
}
currentThreshold(); // fail at startup if OVERLAP_THRESHOLD_PERCENT is invalid

createBackendServer().listen(port, () => {
  console.log(`CaCaoCom backend listening on http://localhost:${port}`);
});
