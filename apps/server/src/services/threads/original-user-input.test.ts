import { describe, expect, it } from "vitest";
import { createStandaloneBuiltinCompactCommandInput } from "@bb/domain";
import { userAuthoredTurnText } from "./original-user-input.js";

const base = {
  initiator: "user" as const,
  input: [
    {
      type: "text" as const,
      text: "check the build log for node-7",
      mentions: [],
    },
  ],
  mode: "start" as const,
};

describe("userAuthoredTurnText", () => {
  it("returns the verbatim text for a fresh single-block user turn", () => {
    expect(userAuthoredTurnText(base)).toBe("check the build log for node-7");
  });

  it("omits non-user initiators", () => {
    expect(
      userAuthoredTurnText({ ...base, initiator: "agent" }),
    ).toBeUndefined();
    expect(
      userAuthoredTurnText({ ...base, initiator: "system" }),
    ).toBeUndefined();
  });

  it("omits active-thread steers and auto-steers", () => {
    expect(userAuthoredTurnText({ ...base, mode: "steer" })).toBeUndefined();
    expect(userAuthoredTurnText({ ...base, mode: "auto" })).toBeUndefined();
  });

  it("omits retries", () => {
    expect(
      userAuthoredTurnText({
        ...base,
        retryOf: { requestId: "creq_2222222222", attempt: 2 },
      }),
    ).toBeUndefined();
  });

  it("omits service notices and plugin-originated tells", () => {
    expect(
      userAuthoredTurnText({
        ...base,
        systemMessageKind: "child-completed",
      }),
    ).toBeUndefined();
    expect(
      userAuthoredTurnText({ ...base, originPluginId: "workflows" }),
    ).toBeUndefined();
  });

  it("omits grouped inputs and multi-block inputs", () => {
    expect(
      userAuthoredTurnText({
        ...base,
        inputGroups: [base.input],
      }),
    ).toBeUndefined();
    expect(
      userAuthoredTurnText({
        ...base,
        input: [...base.input, { type: "localFile", path: "/tmp/report.md" }],
      }),
    ).toBeUndefined();
  });

  it("omits non-text blocks and agent-only visibility", () => {
    expect(
      userAuthoredTurnText({
        ...base,
        input: [{ type: "localImage", path: "/tmp/shot.png" }],
      }),
    ).toBeUndefined();
    expect(
      userAuthoredTurnText({
        ...base,
        input: [
          {
            type: "text",
            text: "internal",
            mentions: [],
            visibility: "agent-only" as const,
          },
        ],
      }),
    ).toBeUndefined();
  });

  it("omits blank text and the standalone /compact command", () => {
    expect(
      userAuthoredTurnText({
        ...base,
        input: [{ type: "text", text: "   ", mentions: [] }],
      }),
    ).toBeUndefined();
    expect(
      userAuthoredTurnText({
        ...base,
        input: createStandaloneBuiltinCompactCommandInput(),
      }),
    ).toBeUndefined();
  });
});
