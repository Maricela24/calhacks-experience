import type {
  BinaryAttachment, EngineDependencies, EngineInput, EngineProgress, EngineResult, GeneratedFile,
} from "@afterhours/contracts";
import { execute } from "./pipeline";

export type { BinaryAttachment, EngineDependencies, EngineInput, EngineProgress, EngineResult, GeneratedFile };
export { calculateSales, type SalesMetrics, type SalesRow } from "./calculations";
export { resolveDeadline } from "./dates";
export { EngineError } from "./errors";

export async function runWork(input: EngineInput, deps: EngineDependencies): Promise<EngineResult> {
  return execute(input, deps);
}
