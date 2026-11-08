/**
 * HTTP routes for Nuttanun's backend tasks. Unknown routes fall through to Voot's
 * existing handler (src/api/plotComparison.ts), so /health and /api/plots/compare keep working.
 *
 * Sprint 1
 *   GET  /api/settings/flagging          current threshold and rule        (009.2)
 *   POST /api/plots/:plotId/check        run the check, update the status  (009.1 + 009.2)
 *   GET  /api/plots/:plotId/overlap      latest overlap % and why          (009.1)
 * Sprint 2
 *   GET  /api/settings/area-tolerance    area mismatch tolerance           (013)
 *   POST /api/plots/:plotId/documents    add a land document (Pending)     (003.2, minimal until 004)
 *   GET  /api/plots/:plotId/documents    documents of a plot               (003.2)
 *   GET  /api/documents/:id              one document                      (003.2)
 *   POST /api/documents/:id/verify       Approve / Reject                  (003.2)
 */

import { createServer, type IncomingMessage, type RequestListener, type ServerResponse } from "node:http";
import type pg from "pg";
import { createApiServer } from "../api/plotComparison.ts";
import { pool as defaultPool } from "../db/pool.ts";
import { areaToleranceRuleText, currentAreaTolerance } from "./areaTolerance.ts";
import {
  addDocument, DocumentNotFoundError, getDocument, InvalidTransitionError, listPlotDocuments, verifyDocument,
} from "./documents.ts";
import { currentThreshold, ruleText } from "./flagging.ts";
import { getOverlap, PlotNotFoundError, runSatelliteCheck, withTransaction } from "./satelliteCheck.ts";

const PLOT_ROUTE = /^\/api\/plots\/([^/]+)\/(check|overlap|documents)$/;
const DOCUMENT_ROUTE = /^\/api\/documents\/([^/]+)(\/verify)?$/;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,20}$/; // plot_id, agent_id and reviewer ids are VARCHAR(20)
const MAX_BODY_BYTES = 10_000;

class BadRequest extends Error {}
class MethodNotAllowed extends Error {}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value));
}

async function readOptionalJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new RangeError("Request body is too large");
    chunks.push(buffer);
  }
  if (size === 0) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new BadRequest("Request body must be valid JSON");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new BadRequest("Request body must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}

function requireMethod(request: IncomingMessage, method: string): void {
  if (request.method !== method) throw new MethodNotAllowed();
}

function requireId(value: unknown, name: string): string {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) {
    throw new BadRequest(`${name} must be 1-20 letters, digits, '-' or '_'`);
  }
  return value;
}

function requireFileUrl(value: unknown): string {
  if (typeof value !== "string" || value.length > 500) throw new BadRequest("fileUrl must be a URL up to 500 characters");
  let url: URL;
  try { url = new URL(value); } catch { throw new BadRequest("fileUrl must be a valid URL"); }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new BadRequest("fileUrl must start with http or https");
  return value;
}

export function createBackendHandler(pool: pg.Pool = defaultPool): RequestListener {
  const fallback = createApiServer().listeners("request")[0] as RequestListener;

  return async (request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");

    try {
      // ---- Settings ----
      if (url.pathname === "/api/settings/flagging") {
        requireMethod(request, "GET");
        const threshold = currentThreshold();
        return sendJson(response, 200, { thresholdPercent: threshold, rule: ruleText(threshold) });
      }
      if (url.pathname === "/api/settings/area-tolerance") {
        requireMethod(request, "GET");
        const tolerance = currentAreaTolerance();
        return sendJson(response, 200, { tolerancePercent: tolerance, rule: areaToleranceRuleText(tolerance) });
      }

      // ---- Plots ----
      const plotMatch = PLOT_ROUTE.exec(url.pathname);
      if (plotMatch) {
        const plotId = requireId(decodeURIComponent(plotMatch[1]), "plotId");
        switch (plotMatch[2]) {
          case "overlap":
            requireMethod(request, "GET");
            return sendJson(response, 200, await getOverlap(pool, plotId));
          case "check": {
            requireMethod(request, "POST");
            const body = await readOptionalJson(request);
            const agentId = requireId(body.agentId ?? "SYSTEM", "agentId");
            const result = await withTransaction(pool, (client) => runSatelliteCheck(client, plotId, agentId));
            return sendJson(response, 200, result);
          }
          case "documents":
            if (request.method === "GET") return sendJson(response, 200, await listPlotDocuments(pool, plotId));
            requireMethod(request, "POST");
            return sendJson(response, 201,
              await addDocument(pool, plotId, requireFileUrl((await readOptionalJson(request)).fileUrl)));
        }
      }

      // ---- Documents ----
      const docMatch = DOCUMENT_ROUTE.exec(url.pathname);
      if (docMatch) {
        const id = Number(docMatch[1]);
        if (!Number.isSafeInteger(id) || id < 1) throw new BadRequest("Document id must be a positive integer");
        if (!docMatch[2]) {
          requireMethod(request, "GET");
          return sendJson(response, 200, await getDocument(pool, id));
        }
        requireMethod(request, "POST");
        const body = await readOptionalJson(request);
        if (body.decision !== "Approve" && body.decision !== "Reject") {
          throw new BadRequest("decision must be 'Approve' or 'Reject'");
        }
        const reviewerId = requireId(body.reviewerId, "reviewerId");
        let reason: string | null = null;
        if (body.decision === "Reject") {
          if (typeof body.reason !== "string" || !body.reason.trim() || body.reason.length > 255) {
            throw new BadRequest("reason (1-255 characters) is required to reject a document");
          }
          reason = body.reason;
        }
        const doc = await withTransaction(pool, (client) =>
          verifyDocument(client, id, body.decision as "Approve" | "Reject", reviewerId, reason));
        return sendJson(response, 200, doc);
      }

      return fallback(request, response);
    } catch (error) {
      if (error instanceof MethodNotAllowed) return sendJson(response, 405, { error: "Method not allowed" });
      if (error instanceof BadRequest) return sendJson(response, 400, { error: error.message });
      if (error instanceof PlotNotFoundError || error instanceof DocumentNotFoundError) {
        return sendJson(response, 404, { error: error.message });
      }
      if (error instanceof InvalidTransitionError) return sendJson(response, 409, { error: error.message });
      if (error instanceof RangeError) {
        const tooLarge = error.message.includes("too large");
        return sendJson(response, tooLarge ? 413 : 500, { error: tooLarge ? error.message : "Server configuration error" });
      }
      console.error(error);
      return sendJson(response, 500, { error: "Internal server error" });
    }
  };
}

export function createBackendServer(pool: pg.Pool = defaultPool) {
  return createServer(createBackendHandler(pool));
}
