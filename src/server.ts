import { createApiServer } from "./api/plotComparison.ts";

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new RangeError("PORT must be an integer between 1 and 65535");
}

createApiServer().listen(port, () => {
  console.log(`CaCaoCom API listening on http://localhost:${port}`);
});
