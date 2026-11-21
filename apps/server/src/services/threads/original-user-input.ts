import {
  isStandaloneBuiltinCompactCommand,
  type OriginalUserText,
  type PromptInput,
  type SystemMessageKind,
  type ThreadTurnInitiator,
} from "@bb/domain";
import type { TurnRequestRetryMarker } from "./thread-events.js";

export interface UserAuthoredTurnTextArgs {
  initiator: ThreadTurnInitiator;
  input: readonly PromptInput[];
  inputGroups?: readonly PromptInput[][];
  mode: "start" | "auto" | "steer";
  originPluginId?: string | null;
  retryOf?: TurnRequestRetryMarker;
  systemMessageKind?: SystemMessageKind;
}

export function userAuthoredTurnText(
  args: UserAuthoredTurnTextArgs,
): OriginalUserText | undefined {
  if (args.initiator !== "user") return undefined;
  if (args.mode !== "start") return undefined;
  if (args.retryOf !== undefined) return undefined;
  if (args.systemMessageKind !== undefined) return undefined;
  if (args.originPluginId !== undefined && args.originPluginId !== null) {
    return undefined;
  }
  if (args.inputGroups !== undefined) return undefined;
  if (args.input.length !== 1) return undefined;
  const block = args.input[0];
  if (block === undefined) return undefined;
  if (block.type !== "text") return undefined;
  if (block.visibility !== undefined) return undefined;
  if (block.text.trim().length === 0) return undefined;
  if (isStandaloneBuiltinCompactCommand(args.input)) return undefined;
  return block.text;
}
