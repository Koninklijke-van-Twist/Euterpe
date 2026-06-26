import assert from "node:assert/strict";
import { describe, it } from "node:test";

export function parseQueueDeleteId(pathname) {
  const m = pathname.match(/^\/api\/queue\/(\d+)$/);
  return m ? Number(m[1]) : null;
}

export function parseQueuePlayId(pathname) {
  const m = pathname.match(/^\/api\/queue\/(\d+)\/play$/);
  return m ? Number(m[1]) : null;
}

describe("queue route parsing", () => {
  it("parses DELETE /api/queue/:id", () => {
    assert.equal(parseQueueDeleteId("/api/queue/18"), 18);
    assert.equal(parseQueueDeleteId("/api/queue/18/play"), null);
    assert.equal(parseQueueDeleteId("/api/queue/"), null);
  });

  it("parses POST /api/queue/:id/play", () => {
    assert.equal(parseQueuePlayId("/api/queue/19/play"), 19);
    assert.equal(parseQueuePlayId("/api/queue/19"), null);
  });
});
