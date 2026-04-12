import type {
  RuntimeBackendAdapter,
  RuntimeBackendAvailability,
  RuntimeBackendCapabilities,
  RuntimeBackendExecutionObserver,
  RuntimeBackendExecutionRequest,
  RuntimeBackendExecutionResult,
} from "./contracts.js";

export interface AriaRuntimeExecutionDriver {
  execute(
    request: RuntimeBackendExecutionRequest,
    observer?: RuntimeBackendExecutionObserver
  ): Promise<RuntimeBackendExecutionResult>;
  cancel(executionId: string): Promise<void>;
}

export interface AriaRuntimeBackendOptions {
  available?: boolean;
  version?: string | null;
  driver: AriaRuntimeExecutionDriver;
}

export class AriaRuntimeBackendAdapter implements RuntimeBackendAdapter {
  readonly backend = "aria";
  readonly displayName = "Aria Runtime";
  readonly capabilities: RuntimeBackendCapabilities = {
    supportsStreamingEvents: true,
    supportsCancellation: true,
    supportsStructuredOutput: true,
    supportsFileEditing: true,
    supportsBackgroundExecution: true,
    supportsAuthProbe: false,
  };

  constructor(private readonly options: AriaRuntimeBackendOptions) {}

  async probeAvailability(): Promise<RuntimeBackendAvailability> {
    return {
      available: this.options.available ?? true,
      detectedVersion: this.options.version ?? null,
      authState: "unknown",
      reason: null,
    };
  }

  async execute(
    request: RuntimeBackendExecutionRequest,
    observer?: RuntimeBackendExecutionObserver
  ): Promise<RuntimeBackendExecutionResult> {
    return this.options.driver.execute(request, observer);
  }

  async cancel(executionId: string): Promise<void> {
    await this.options.driver.cancel(executionId);
  }
}

export function createAriaRuntimeBackendAdapter(
  options: AriaRuntimeBackendOptions
): AriaRuntimeBackendAdapter {
  return new AriaRuntimeBackendAdapter(options);
}
