import { describe, expect, it } from "vitest";
import {
  createEnvironment,
  createProject,
  createThread,
  noopNotifier,
  upsertHost,
} from "@bb/db";
import { createMigratedConnection } from "@bb/db/testing";
import type { ResolvedThreadExecutionOptions } from "@bb/domain";
import { NotificationHub } from "../../ws/hub.js";
import {
  requestThreadProvision,
  requestThreadTargetReprovision,
} from "./thread-provisioning.js";
import { persistedThreadProvisionContextSchema } from "./thread-startup-store.js";

const execution: ResolvedThreadExecutionOptions = {
  model: "gpt-5",
  serviceTier: "default",
  reasoningLevel: "medium",
  permissionMode: "full",
  source: "client/thread/start",
};

interface ProvisionFixture {
  db: ReturnType<typeof createMigratedConnection>;
  environment: ReturnType<typeof createEnvironment>;
  hub: NotificationHub;
  thread: ReturnType<typeof createThread>;
}

function provisionFixture(): ProvisionFixture {
  const db = createMigratedConnection();
  const hub = new NotificationHub();
  upsertHost(db, noopNotifier, { id: "host_1", name: "Provision host" });
  const { project } = createProject(db, noopNotifier, {
    name: "Provision provenance",
    source: { type: "local_path", hostId: "host_1", path: "/tmp/provision" },
  });
  const environment = createEnvironment(db, noopNotifier, {
    hostId: "host_1",
    projectId: project.id,
    providerOwnsPath: false,
    status: "error",
    path: "/tmp/provision",
  });
  const thread = createThread(db, noopNotifier, {
    projectId: project.id,
    environmentId: environment.id,
    providerId: "acp-qwen-code",
  });
  return { db, environment, hub, thread };
}

function provision(
  fixture: ProvisionFixture,
  args: Partial<Parameters<typeof requestThreadProvision>[1]> = {},
) {
  return requestThreadProvision(
    { db: fixture.db, hub: fixture.hub },
    {
      author: { initiator: "user", senderThreadId: null },
      environmentIntent: {
        type: "reuse",
        environmentId: fixture.environment.id,
      },
      execution,
      fork: null,
      input: [
        { type: "text", text: "check the build log for node-7", mentions: [] },
      ],
      originPluginId: null,
      providerInput: [
        { type: "text", text: "provider-facing expanded blocks", mentions: [] },
      ],
      startedOnBehalfOf: null,
      thread: fixture.thread,
      titleProvided: false,
      ...args,
    },
  );
}

describe("requestThreadProvision original user text provenance", () => {
  it("attributes the original from submitted input, not providerInput or plugin-mention expansion", () => {
    const fixture = provisionFixture();
    const { context } = provision(fixture);

    expect(context.request.input).toEqual([
      { type: "text", text: "provider-facing expanded blocks", mentions: [] },
    ]);
    expect(context.request.originalUserText).toBe(
      "check the build log for node-7",
    );

    const mentionExpanded = provision(fixture, {
      input: [
        { type: "text", text: "check @ISS-42", mentions: [] },
        {
          type: "text",
          text: "<plugin_mention_context>Issue 42</plugin_mention_context>",
          mentions: [],
          visibility: "agent-only",
        },
      ],
      submittedInput: [{ type: "text", text: "check @ISS-42", mentions: [] }],
    });
    expect(mentionExpanded.context.request.originalUserText).toBe(
      "check @ISS-42",
    );
  });

  it("omits provenance for retries, plugin-originated spawns, and grouped inputs", () => {
    const fixture = provisionFixture();
    const retry = provision(fixture, {
      retryOf: { requestId: "creq_abcdefghij", attempt: 2 },
    });
    expect(retry.context.request.originalUserText).toBeUndefined();

    const pluginSpawn = provision(fixture, {
      originPluginId: "workflows",
      author: { initiator: "agent", senderThreadId: "thr_parent" },
    });
    expect(pluginSpawn.context.request.originalUserText).toBeUndefined();

    const grouped = provision(fixture, {
      inputGroups: [
        [{ type: "text", text: "first", mentions: [] }],
        [{ type: "text", text: "second", mentions: [] }],
      ],
    });
    expect(grouped.context.request.originalUserText).toBeUndefined();
  });

  it("preserves pre-expansion submittedInput and omits system notices during target reprovision", () => {
    const fixture = provisionFixture();
    const reprovisioned = requestThreadTargetReprovision(
      { db: fixture.db, hub: fixture.hub },
      {
        environment: fixture.environment,
        execution,
        initiator: "user",
        input: [
          {
            type: "text",
            text: "deferred seed context",
            mentions: [],
            visibility: "agent-only",
          },
          { type: "text", text: "check the build log", mentions: [] },
        ],
        submittedInput: [
          { type: "text", text: "check the build log", mentions: [] },
        ],
        originPluginId: null,
        senderThreadId: null,
        provider: {
          environmentProviderId: "git-worktree",
          selection: {
            machine: { type: "existing", hostId: "host_1" },
            inputs: {},
          },
        },
        thread: fixture.thread,
      },
    );
    expect(reprovisioned.context.request.originalUserText).toBe(
      "check the build log",
    );

    const systemReprovision = requestThreadTargetReprovision(
      { db: fixture.db, hub: fixture.hub },
      {
        environment: fixture.environment,
        execution,
        initiator: "user",
        input: [{ type: "text", text: "child finished", mentions: [] }],
        originPluginId: null,
        senderThreadId: null,
        systemMessageKind: "child-completed",
        provider: {
          environmentProviderId: "git-worktree",
          selection: {
            machine: { type: "existing", hostId: "host_1" },
            inputs: {},
          },
        },
        thread: fixture.thread,
      },
    );
    expect(systemReprovision.context.request.originalUserText).toBeUndefined();
  });

  it("round-trips an older startup record without the field as an omission", () => {
    const parsed = persistedThreadProvisionContextSchema.parse({
      request: {
        clientRequestId: "creq_abcdefghij",
        environmentIntent: { type: "reuse", environmentId: "env_1" },
        execution: null,
        fork: null,
        input: [{ type: "text", text: "legacy", mentions: [] }],
        titleProvided: false,
        seedWithoutRun: false,
        initiator: "user",
      },
      state: {
        environmentId: null,
        provisionEventSequence: null,
        provisioningId: "prov_1",
        workspaceReadyEventSequence: null,
      },
    });
    expect(parsed.request.originalUserText).toBeUndefined();
  });
});
