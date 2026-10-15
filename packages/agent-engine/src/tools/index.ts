import { hashJson, type ToolRun } from '../trace.ts';
import { TOOLS, type ToolArgs, type ToolName } from './catalog.ts';
import { ToolArgumentError, type ToolContext } from './context.ts';

export { TOOL_NAMES, TOOLS, type ToolArgs, type ToolMode, type ToolName, type ToolSpec } from './catalog.ts';
export {
  createToolContext,
  EQUITY_ITERATIONS,
  ToolArgumentError,
  toolSeed,
  type BotTurnInput,
  type FoldModel,
  type ToolContext,
} from './context.ts';

/** Tools the model may ask for in deep mode; the advisor only in the consultant arm. */
export function deepTools(withAdvisor: boolean): ToolName[] {
  return (Object.values(TOOLS))
    .filter((spec) => spec.mode === 'eager+deep' || spec.mode === 'deep' || (withAdvisor && spec.mode === 'consultant'))
    .map((spec) => spec.name);
}

function checkArgs(name: ToolName, args: ToolArgs): void {
  const shape = TOOLS[name].args;
  if (shape !== 'seat' && shape !== 'seat_or_all' && args.seat !== null) {
    throw new ToolArgumentError(`${name} takes no seat`);
  }
  if (shape === 'seat' && args.seat === null) {
    throw new ToolArgumentError(`${name} needs a seat`);
  }
  if (shape !== 'option' && args.option !== null) {
    throw new ToolArgumentError(`${name} takes no option`);
  }
  if (shape === 'option' && args.option === null) {
    throw new ToolArgumentError(`${name} needs an option`);
  }
}

/**
 * Runs one tool and records it. Argument errors (a seat that isn't a live opponent, an option not on
 * the menu) come back as a failed run; anything else is a bug and throws.
 */
export function runTool(ctx: ToolContext, name: ToolName, args: ToolArgs): ToolRun & { result: unknown } {
  const started = performance.now();
  let result: unknown = null;
  let error: string | null = null;
  try {
    checkArgs(name, args);
    result = TOOLS[name].output.parse(TOOLS[name].execute(ctx, args));
  } catch (caught) {
    if (!(caught instanceof ToolArgumentError)) {
      throw caught;
    }
    error = caught.message;
  }
  return {
    tool: name,
    args,
    ms: performance.now() - started,
    ok: error === null,
    error,
    resultHash: hashJson(result),
    result,
  };
}
