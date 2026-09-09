export type ArtifactKind = "api-implementation" | "api-tests" | "gui-implementation" | "gui-tests";

export class ArtifactExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArtifactExtractionError";
  }
}

function unwrapSingleFence(raw: string): string {
  const trimmed = raw.trim();
  const match = /^```(?:typescript|ts|html)?\s*\n([\s\S]*?)\n```$/i.exec(trimmed);
  return (match?.[1] ?? trimmed).trim();
}

export function extractArtifact(raw: string, kind: ArtifactKind): string {
  const source = unwrapSingleFence(raw);

  if (source.length === 0) {
    throw new ArtifactExtractionError("The model returned an empty artifact.");
  }
  if (source.includes("\0")) {
    throw new ArtifactExtractionError("The artifact contains a null byte.");
  }
  if (source.includes("```")) {
    throw new ArtifactExtractionError("The response contains commentary or multiple code fences.");
  }

  if (kind === "api-implementation" && !/\bexport\s+default\b/.test(source)) {
    throw new ArtifactExtractionError("The API implementation has no default export.");
  }
  if (kind === "api-tests" && !/\bfrom\s+["']vitest["']/.test(source)) {
    throw new ArtifactExtractionError("The API train tests do not import Vitest.");
  }
  if (kind === "gui-implementation" && !/<html(?:\s|>)/i.test(source)) {
    throw new ArtifactExtractionError("The GUI implementation is not a complete HTML document.");
  }
  if (kind === "gui-tests" && !/\bfrom\s+["']@playwright\/test["']/.test(source)) {
    throw new ArtifactExtractionError("The GUI train tests do not import Playwright Test.");
  }

  return `${source}\n`;
}
