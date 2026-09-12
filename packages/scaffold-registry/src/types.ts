export type ScaffoldType =
  | 'MOCK_FALLBACK'
  | 'TRANSITIONAL_ADAPTER'
  | 'SYNTHETIC_FIXTURE'
  | 'TEMPORARY_STUB';

export interface ScaffoldEntry {
  id: string;
  component: string;
  lines: string;
  type: ScaffoldType;
  rationale: string;
  removalCondition: string;
  responsibleAgent: string;
  blockedMilestone: string;
  registeredAt: string;
}

export interface ScaffoldPolicy {
  zeroUntrackedTodo: boolean;
  requireExplicitRemovalCondition: boolean;
  blockOnExpiredMilestone: boolean;
}

export interface ScaffoldManifest {
  $schema: string;
  version: string;
  updatedAt: string;
  project: string;
  organization: string;
  policy: ScaffoldPolicy;
  scaffolds: ScaffoldEntry[];
}

export interface CreateTrackedScaffoldOptions<T> {
  scaffoldId: string;
  devFallback: () => T;
  onProductionAttempt?: 'THROW' | 'WARN';
  context?: Record<string, unknown>;
}

export interface ViolationRecord {
  file: string;
  line: number;
  snippet: string;
  rule: string;
  message: string;
}

export interface ScanResult {
  passed: boolean;
  totalFilesScanned: number;
  registeredScaffolds: number;
  violations: ViolationRecord[];
}
