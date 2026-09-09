import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { startApiServer, type RunningServer } from "../../src/harness/api-server.js";
import { startGuiServer } from "../../src/harness/gui-server.js";

const runningServers: RunningServer[] = [];
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(runningServers.splice(0).map((server) => server.close()));
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  );
});

describe("API server harness", () => {
  it("forwards registration requests to a Web Request handler", async () => {
    const server = await startApiServer({
      handler: async (request) => {
        const input = (await request.json()) as { username: string };
        return Response.json(
          { username: input.username, email: "student@example.com", sessionToken: "token" },
          { status: 201 },
        );
      },
    });
    runningServers.push(server);

    const response = await fetch(`${server.url}/api/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "student" }),
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ username: "student" });
  });

  it("owns route and method handling outside the generated implementation", async () => {
    const server = await startApiServer({
      handler: () => new Response(null, { status: 204 }),
    });
    runningServers.push(server);

    await expect(fetch(`${server.url}/missing`)).resolves.toMatchObject({ status: 404 });
    await expect(fetch(`${server.url}/api/register`)).resolves.toMatchObject({ status: 405 });
  });
});

describe("GUI server harness", () => {
  it("serves only the generated HTML entry point", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tdd-course-gui-"));
    temporaryDirectories.push(directory);
    const htmlPath = join(directory, "index.html");
    await writeFile(htmlPath, "<!doctype html><title>Registration</title>", "utf8");

    const server = await startGuiServer({ htmlPath });
    runningServers.push(server);

    const page = await fetch(server.url);
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toContain("text/html");
    await expect(page.text()).resolves.toContain("Registration");
    await expect(fetch(`${server.url}/other.js`)).resolves.toMatchObject({ status: 404 });
  });
});
