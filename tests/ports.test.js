import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseListenPorts } from "../server/config.js";

describe("parseListenPorts", () => {
  it("defaults to port 8000", () => {
    assert.deepEqual(parseListenPorts({}), [8000]);
  });

  it("parses EUTERPE_PORT", () => {
    assert.deepEqual(parseListenPorts({ EUTERPE_PORT: "3000" }), [3000]);
  });

  it("parses comma-separated EUTERPE_PORTS", () => {
    assert.deepEqual(parseListenPorts({ EUTERPE_PORTS: "8000,80" }), [8000, 80]);
  });

  it("deduplicates ports", () => {
    assert.deepEqual(parseListenPorts({ EUTERPE_PORTS: "80,80,8000" }), [80, 8000]);
  });

  it("adds EUTERPE_EXTRA_PORTS to primary", () => {
    assert.deepEqual(
      parseListenPorts({ EUTERPE_PORT: "8000", EUTERPE_EXTRA_PORTS: "80" }),
      [8000, 80]
    );
  });
});
