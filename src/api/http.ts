import type { IncomingMessage, ServerResponse } from "node:http";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from "../application/errors.ts";

const MAX_BODY_BYTES = 1_000_000;

export function sendJson(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value));
}

export async function readJson(request: IncomingMessage): Promise<unknown> {
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

/** Maps application errors to HTTP status codes. */
export function sendError(response: ServerResponse, error: unknown): void {
  if (error instanceof UnauthorizedError) {
    sendJson(response, 401, { error: error.message });
  } else if (error instanceof ForbiddenError) {
    sendJson(response, 403, { error: error.message });
  } else if (error instanceof NotFoundError) {
    sendJson(response, 404, { error: error.message });
  } else if (error instanceof ConflictError) {
    sendJson(response, 409, { error: error.message });
  } else if (
    error instanceof RangeError || error instanceof TypeError ||
    error instanceof SyntaxError || error instanceof URIError
  ) {
    const status = error instanceof RangeError && error.message.includes("1 MB") ? 413 : 400;
    sendJson(response, status, { error: error.message });
  } else {
    console.error(error);
    sendJson(response, 500, { error: "Internal server error" });
  }
}