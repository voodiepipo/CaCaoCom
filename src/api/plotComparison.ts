import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { comparePlotWithBaseline } from "../application/comparePlot.ts";
import type { Polygon } from "../geometry/polygonOverlap.ts";

const MAX_BODY_BYTES = 1_000_000;

type ComparePayload = {
  newPlot: Polygon;
  baseline: Polygon;
  minimumBaselineOverlap?: number;
};

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value));
}

function isPolygon(value: unknown): value is Polygon {
  return Array.isArray(value) && value.length >= 3 && value.every(
    (point) => Array.isArray(point) && point.length === 2 &&
      Number.isFinite(point[0]) && Number.isFinite(point[1]),
  );
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new RangeError("Request body exceeds 1 MB");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function createApiServer() {
  return createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");

    if (request.method === "GET" && url.pathname === "/health") {
      sendJson(response, 200, { status: "ok" });
      return;
    }

    if (request.method !== "POST" || url.pathname !== "/api/plots/compare") {
      sendJson(response, 404, { error: "Route not found" });
      return;
    }

    try {
      const payload = await readJson(request) as Partial<ComparePayload>;
      if (!payload || !isPolygon(payload.newPlot) || !isPolygon(payload.baseline)) {
        sendJson(response, 400, {
          error: "Expected newPlot and baseline as arrays of [x, y] coordinates (at least three points)",
        });
        return;
      }
      if (payload.minimumBaselineOverlap !== undefined &&
          (typeof payload.minimumBaselineOverlap !== "number" || !Number.isFinite(payload.minimumBaselineOverlap))) {
        sendJson(response, 400, { error: "minimumBaselineOverlap must be a number between 0 and 1" });
        return;
      }

      const result = comparePlotWithBaseline(
        payload.newPlot,
        payload.baseline,
        payload.minimumBaselineOverlap,
      );
      sendJson(response, 200, result);
    } catch (error) {
      if (error instanceof RangeError || error instanceof TypeError || error instanceof SyntaxError) {
        const status = error instanceof RangeError && error.message.includes("1 MB") ? 413 : 400;
        sendJson(response, status, { error: error.message });
        return;
      }
      sendJson(response, 500, { error: "Internal server error" });
    }
  });
}
