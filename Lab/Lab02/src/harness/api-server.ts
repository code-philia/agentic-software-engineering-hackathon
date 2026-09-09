import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export type RegistrationHandler = (
  request: Request,
) => Response | Promise<Response>;

export interface RunningServer {
  readonly url: string;
  close(): Promise<void>;
}

export interface ApiServerOptions {
  readonly handler: RegistrationHandler;
  readonly port?: number;
}

export async function loadRegistrationHandler(path: string): Promise<RegistrationHandler> {
  const url = pathToFileURL(resolve(path));
  url.searchParams.set("courseRun", randomUUID());
  const generatedModule = (await import(url.href)) as { default?: unknown };

  if (typeof generatedModule.default !== "function") {
    throw new Error("The generated API implementation does not default-export a handler.");
  }
  return generatedModule.default as RegistrationHandler;
}

const HOST = "127.0.0.1";
const MAX_REQUEST_BYTES = 1_000_000;

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_REQUEST_BYTES) {
      throw new Error("Request body is too large.");
    }
    chunks.push(buffer);
  }

  return Buffer.concat(chunks).toString("utf8");
}

function sendJsonError(response: ServerResponse, status: number, error: string): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify({ error }));
}

async function forwardResponse(source: Response, target: ServerResponse): Promise<void> {
  const headers: Record<string, string> = {};
  source.headers.forEach((value, name) => {
    headers[name] = value;
  });

  target.writeHead(source.status, headers);
  target.end(Buffer.from(await source.arrayBuffer()));
}

export async function startApiServer(options: ApiServerOptions): Promise<RunningServer> {
  const server = createServer(async (incoming, outgoing) => {
    try {
      const requestUrl = new URL(incoming.url ?? "/", `http://${HOST}`);

      if (requestUrl.pathname !== "/api/register") {
        sendJsonError(outgoing, 404, "Not found.");
        return;
      }

      if (incoming.method !== "POST") {
        outgoing.setHeader("allow", "POST");
        sendJsonError(outgoing, 405, "Method not allowed.");
        return;
      }

      const body = await readBody(incoming);
      const request = new Request(new URL(requestUrl.pathname, `http://${HOST}`), {
        method: "POST",
        headers: incoming.headers as HeadersInit,
        body,
      });
      await forwardResponse(await options.handler(request), outgoing);
    } catch {
      if (!outgoing.headersSent) {
        sendJsonError(outgoing, 500, "The registration handler failed.");
      } else {
        outgoing.end();
      }
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, HOST, () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  if (address === null || typeof address === "string") {
    server.close();
    throw new Error("The API server did not receive a TCP port.");
  }

  return {
    url: `http://${HOST}:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
