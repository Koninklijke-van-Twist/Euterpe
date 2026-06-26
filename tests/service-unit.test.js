import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const root = path.resolve(import.meta.dirname, "..");

describe("euterpe.service", () => {
  it("starts run.sh via /bin/sh (noexec-safe)", () => {
    const unit = fs.readFileSync(path.join(root, "scripts/euterpe.service"), "utf8");
    assert.match(unit, /^ExecStart=\/bin\/sh @INSTALL_DIR@\/scripts\/run\.sh$/m);
    assert.doesNotMatch(unit, /^ExecStart=@INSTALL_DIR@\/scripts\/run\.sh$/m);
    assert.doesNotMatch(unit, /^ExecStart=\/usr\/bin\/env /m);
  });
});
