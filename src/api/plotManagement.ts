import type { IncomingMessage, ServerResponse } from "node:http";
import { assignPlot, getCurrentAssignment, listActiveAgents } from "../application/assignPlot.ts";
import { UnauthorizedError } from "../application/errors.ts";
import { checkLandSizeMismatch } from "../application/landSizeMismatch.ts";
import { updateLandArea } from "../application/updateLandArea.ts";
import { pool } from "../db/pool.ts";
import { withTransaction } from "../db/transaction.ts";
import { readJson, sendError, sendJson } from "./http.ts";

const PLOT_ROUTE = /^\/api\/plots\/([^/]+)\/(land-area|mismatch-check|assignment)$/;

/** Stand-in for real login: the caller's user id comes from the x-user-id header. */
function userIdFrom(request: IncomingMessage): string | undefined {
  const value = request.headers["x-user-id"];
  const id = typeof value === "string" ? value.trim() : "";
  if (id === "") return undefined;
  if (id.length > 20) throw new RangeError("x-user-id must be at most 20 characters");
  return id;
}

async function readObject(request: IncomingMessage): Promise<Record<string, unknown>> {
  const body = await readJson(request);
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new TypeError("Expected a JSON object");
  }
  return body as Record<string, unknown>;
}

/** Returns true when the request matched one of the routes below. */
export async function handlePlotManagementRoute(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
): Promise<boolean> {
  const method = request.method ?? "GET";
  try {
    if (url.pathname === "/api/agents") {
      if (method !== "GET") {
        sendJson(response, 405, { error: "Method not allowed" });
        return true;
      }
      sendJson(response, 200, { agents: await listActiveAgents(pool) });
      return true;
    }

    const match = PLOT_ROUTE.exec(url.pathname);
    if (!match) return false;
    const plotId = decodeURIComponent(match[1]);

    switch (`${method} ${match[2]}`) {
      // 3.1 Update land area
      case "PATCH land-area": {
        const body = await readObject(request);
        const agentId = userIdFrom(request);
        const result = await withTransaction((db) =>
          updateLandArea(db, { plotId, landAreaHa: body.landAreaHa, agentId }));
        sendJson(response, 200, result);
        return true;
      }
      // 13 Re-check a plot (call after sync, import or batch runs)
      case "POST mismatch-check": {
        const agentId = userIdFrom(request);
        const result = await withTransaction((db) => checkLandSizeMismatch(db, plotId, { agentId }));
        sendJson(response, 200, result);
        return true;
      }
      // 15.1 Manual assignment
      case "GET assignment": {
        sendJson(response, 200, { assignment: await getCurrentAssignment(pool, plotId) });
        return true;
      }
      case "PUT assignment": {
        const actorId = userIdFrom(request);
        if (!actorId) throw new UnauthorizedError("x-user-id header is required");
        const body = await readObject(request);
        const result = await withTransaction((db) =>
          assignPlot(db, { plotId, agentId: body.agentId as string, actorId }));
        sendJson(response, 200, result);
        return true;
      }
      default:
        sendJson(response, 405, { error: "Method not allowed" });
        return true;
    }
  } catch (error) {
    sendError(response, error);
    return true;
  }
}