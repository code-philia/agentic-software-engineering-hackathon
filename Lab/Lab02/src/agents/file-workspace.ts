import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

import {
  ArtifactExtractionError,
  extractArtifact,
  type ArtifactKind,
} from "../generation/artifact.js";

export interface AgentFileWriteResult {
  readonly accepted: boolean;
  readonly message: string;
}

export interface AgentFileWorkspaceOptions {
  readonly artifactKind: ArtifactKind;
  readonly allowedPath: string;
  readonly maxWrites?: number;
  readonly writeLabel: string;
  readonly rejectUnchangedFrom?: string;
  readonly onWrite?: (write: number) => Promise<void> | void;
}

/** A one-file capability boundary shared by the API and GUI agents. */
export class AgentFileWorkspace {
  readonly #allowedPath: string;
  readonly #artifactKind: ArtifactKind;
  readonly #maxWrites: number;
  readonly #writeLabel: string;
  readonly #rejectUnchangedFrom: string | undefined;
  readonly #onWrite: ((write: number) => Promise<void> | void) | undefined;
  #writes = 0;

  constructor(options: AgentFileWorkspaceOptions) {
    this.#allowedPath = resolve(options.allowedPath);
    this.#artifactKind = options.artifactKind;
    this.#maxWrites = options.maxWrites ?? 1;
    this.#writeLabel = options.writeLabel;
    this.#rejectUnchangedFrom = options.rejectUnchangedFrom;
    this.#onWrite = options.onWrite;
  }

  get allowedPath(): string {
    return this.#allowedPath;
  }

  get writes(): number {
    return this.#writes;
  }

  async writeFile(path: string, content: string): Promise<AgentFileWriteResult> {
    if (resolve(path) !== this.#allowedPath) {
      return {
        accepted: false,
        message: `Write rejected. This agent may only write ${this.#allowedPath}.`,
      };
    }
    if (this.#writes >= this.#maxWrites) {
      return {
        accepted: false,
        message: `The ${this.#writeLabel} write limit of ${this.#maxWrites} has been reached.`,
      };
    }

    const source = extractArtifact(content, this.#artifactKind);
    if (
      this.#rejectUnchangedFrom !== undefined &&
      source.trim() === this.#rejectUnchangedFrom.trim()
    ) {
      return {
        accepted: false,
        message: `Write rejected because the ${this.#writeLabel} is unchanged. Use the supplied failure feedback to make a substantive correction before writing again.`,
      };
    }
    const directory = dirname(this.#allowedPath);
    const temporaryPath = resolve(directory, `.${basename(this.#allowedPath)}.next`);
    await mkdir(directory, { recursive: true });
    await writeFile(temporaryPath, source, "utf8");
    await rename(temporaryPath, this.#allowedPath);
    this.#writes += 1;
    await this.#onWrite?.(this.#writes);

    return {
      accepted: true,
      message: `${this.#writeLabel} ${this.#writes} of ${this.#maxWrites} was written to ${this.#allowedPath}.`,
    };
  }

  async readWrittenFile(): Promise<string> {
    if (this.#writes === 0) {
      throw new ArtifactExtractionError(
        `The agent did not write the required file: ${this.#allowedPath}`,
      );
    }
    return readFile(this.#allowedPath, "utf8");
  }
}
