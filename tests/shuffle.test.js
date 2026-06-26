import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shuffleWithSpacing } from "../server/shuffle.js";

describe("shuffle", () => {
  it("returns single track unchanged", () => {
    assert.deepEqual(shuffleWithSpacing([42], []), [42]);
  });

  it("keeps all track ids in result", () => {
    const ids = [1, 2, 3, 4, 5, 6, 7, 8];
    const result = shuffleWithSpacing(ids, [6, 7, 8]);
    assert.deepEqual([...result].sort((a, b) => a - b), ids);
  });

  it("avoids previous tail in first five when possible", () => {
    const ids = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const tail = [8, 9, 10];
    for (let i = 0; i < 50; i++) {
      const result = shuffleWithSpacing(ids, tail);
      const firstFive = new Set(result.slice(0, 5));
      assert.ok(![8, 9, 10].some((id) => firstFive.has(id)));
    }
  });
});
