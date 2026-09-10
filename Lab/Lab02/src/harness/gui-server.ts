import { readFile } from "node:fs/promises";
import { createServer } from "node:http";

import type { RunningServer } from "./api-server.js";

export interface GuiServerOptions {
  readonly htmlPath: string;
  readonly port?: number;
}

const BIND_HOST = "127.0.0.1";
const PUBLIC_HOST = "localhost";

export async function startGuiServer(options: GuiServerOptions): Promise<RunningServer> {
  const html = await readFile(options.htmlPath);
  const server = createServer((request, response) => {
    const pathname = new URL(request.url ?? "/", `http://${PUBLIC_HOST}`).pathname;

    if (request.method !== "GET" || (pathname !== "/" && pathname !== "/index.html")) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found.");
      return;
    }

    response.writeHead(200, {
      "cache-control": "no-store",
      "content-type": "text/html; charset=utf-8",
    });
    response.end(html);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, BIND_HOST, () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  if (address === null || typeof address === "string") {
    server.close();
    throw new Error("The GUI server did not receive a TCP port.");
  }

  return {
    url: `http://${PUBLIC_HOST}:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
