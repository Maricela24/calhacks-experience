// FOUNDATION STUB — owned by Person 2. Replace this file's contents (keep the exports).
// This stub never fabricates work: it always throws ENGINE_NOT_IMPLEMENTED.
import type {
  BinaryAttachment, EngineDependencies, EngineInput, EngineProgress, EngineResult,
  GeneratedFile,
} from "@afterhours/contracts";

export type { BinaryAttachment, EngineDependencies, EngineInput, EngineProgress, EngineResult, GeneratedFile };

export class EngineError extends Error {
  code: string;
  retryable: boolean;
  constructor(code: string, message: string, retryable = false) {
    super(message);
    this.name = "EngineError";
    this.code = code;
    this.retryable = retryable;
  }
}

export async function runWork(_input: EngineInput, _deps: EngineDependencies): Promise<EngineResult> {
  throw new EngineError(
    "ENGINE_NOT_IMPLEMENTED",
    "The intelligence engine is not installed yet (foundation stub). Merge Person 2's @afterhours/engine.",
    false,
  );
}
