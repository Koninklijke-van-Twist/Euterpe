import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { daysUntilPurge, TRASH_RETENTION_MS } from "../server/trash.js";

describe("trash", () => {
  it("daysUntilPurge counts down toward zero", () => {
    const deletedAt = new Date(Date.now() - TRASH_RETENTION_MS + 2 * 24 * 60 * 60 * 1000).toISOString();
    const days = daysUntilPurge({ deleted_at: deletedAt });
    assert.ok(days >= 1 && days <= 2);
  });

  it("daysUntilPurge is zero when expired", () => {
    const deletedAt = new Date(Date.now() - TRASH_RETENTION_MS - 1000).toISOString();
    assert.equal(daysUntilPurge({ deleted_at: deletedAt }), 0);
  });
});
