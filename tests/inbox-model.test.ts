import { describe, expect, it } from "vitest";
import { advanceReadMarkers, isUnreadResult } from "../client/inbox-model";

const first = "2026-11-18T10:00:00.000Z";
const second = "2026-11-18T10:01:00.000Z";
const third = "2026-11-18T10:02:00.000Z";

describe("result read markers", () => {
  it("marks the results in the batch and keeps later arrivals unread", () => {
    const unread = [{ agentId: "alice", at: first }, { agentId: "bob", at: second }];
    const read = advanceReadMarkers({ other: first }, unread);

    expect(unread.filter((result) => isUnreadResult(read, result))).toEqual([]);
    expect(isUnreadResult(read, { agentId: "alice", at: third })).toBe(true);
    expect(isUnreadResult(read, { agentId: "new-agent", at: third })).toBe(true);
    expect(read).toEqual({ other: first, alice: first, bob: second });
  });

  it("keeps the latest read marker when a stale view submits older results", () => {
    const prior = { alice: third };
    const batch = [{ agentId: "alice", at: first }, { agentId: "bob", at: second }, { agentId: "bob", at: first }];

    expect(advanceReadMarkers(prior, batch)).toEqual({ alice: third, bob: second });
    expect(prior).toEqual({ alice: third });
  });
});
