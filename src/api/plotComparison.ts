import { createServer} from "node:http";
import { comparePlotWithBaseline } from "../application/comparePlot.ts";
import type { Polygon } from "../geometry/polygonOverlap.ts";
import { readJson, sendJson } from "./http.ts";
import { handlePlotManagementRoute } from "./plotManagement.ts";

type ComparePayload = {
  newPlot: Polygon;
  baseline: Polygon;
  minimumBaselineOverlap?: number;
};

function isPolygon(value: unknown): value is Polygon {
  return Array.isArray(value) && value.length >= 3 && value.every(
    (point) => Array.isArray(point) && point.length === 2 &&
      Number.isFinite(point[0]) && Number.isFinite(point[1]),
  );
}

export function createApiServer() {
  return createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");

    if (request.method === "GET" && url.pathname === "/health") {
      sendJson(response, 200, { status: "ok" });
      return;
    }

    if (await handlePlotManagementRoute(request, response, url)) return;

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
