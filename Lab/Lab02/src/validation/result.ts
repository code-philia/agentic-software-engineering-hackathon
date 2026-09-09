export interface ValidationCategoryResult {
  readonly name: string;
  readonly passed: number;
  readonly total: number;
}

export interface ValidationCheckResult {
  readonly name: string;
  readonly category: string;
  readonly passed: boolean;
}

export interface ValidationResult {
  readonly passed: number;
  readonly total: number;
  readonly durationMs: number;
  readonly categories: readonly ValidationCategoryResult[];
  readonly checks: readonly ValidationCheckResult[];
}
