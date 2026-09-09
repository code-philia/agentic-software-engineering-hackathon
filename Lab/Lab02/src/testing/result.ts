export type TrainTestStatus = "TEST_ERROR" | "RED" | "GREEN";

export interface TrainTestFailure {
  readonly name: string;
  readonly message: string;
}

export interface TrainTestResult {
  readonly status: TrainTestStatus;
  readonly summary: string;
  readonly output: string;
  readonly total?: number;
  readonly passed?: number;
  readonly failed?: number;
  readonly durationMs?: number;
  readonly failures?: readonly TrainTestFailure[];
}
