export interface CommonCliOptions {
  readonly envFile: string;
  readonly model?: string;
}

export interface DemoCliOptions extends CommonCliOptions {
  readonly interactive: boolean;
  readonly stepRepairs: boolean;
  readonly openBrowser: boolean;
}

function optionValue(args: readonly string[], index: number, name: string): string {
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${name} requires a file path.`);
  }
  return value;
}

export function parseCommonOptions(args: readonly string[]): CommonCliOptions {
  let envFile = ".env";
  let model: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--env") {
      envFile = optionValue(args, index, "--env");
      index += 1;
    } else if (argument?.startsWith("--env=")) {
      envFile = argument.slice("--env=".length);
      if (!envFile) throw new Error("--env requires a file path.");
    } else if (argument === "--model") {
      model = optionValue(args, index, "--model");
      index += 1;
    } else if (argument?.startsWith("--model=")) {
      model = argument.slice("--model=".length);
      if (!model) throw new Error("--model requires a model name.");
    } else {
      throw new Error(`Unknown option: ${argument}`);
    }
  }
  return { envFile, ...(model === undefined ? {} : { model }) };
}

export function parseDemoOptions(args: readonly string[]): DemoCliOptions {
  let envFile = ".env";
  let model: string | undefined;
  let interactive = true;
  let stepRepairs = false;
  let openBrowser = true;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--env") {
      envFile = optionValue(args, index, "--env");
      index += 1;
    } else if (argument?.startsWith("--env=")) {
      envFile = argument.slice("--env=".length);
      if (!envFile) throw new Error("--env requires a file path.");
    } else if (argument === "--model") {
      model = optionValue(args, index, "--model");
      index += 1;
    } else if (argument?.startsWith("--model=")) {
      model = argument.slice("--model=".length);
      if (!model) throw new Error("--model requires a model name.");
    } else if (argument === "--no-interactive") {
      interactive = false;
    } else if (argument === "--step-repairs") {
      stepRepairs = true;
    } else if (argument === "--no-open") {
      openBrowser = false;
    } else {
      throw new Error(`Unknown option: ${argument}`);
    }
  }

  return {
    envFile,
    ...(model === undefined ? {} : { model }),
    interactive,
    stepRepairs,
    openBrowser,
  };
}
