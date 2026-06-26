import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const root = path.resolve(import.meta.dirname, "..");

describe("ui dialogs", () => {
  it("public app does not use browser alert or confirm", () => {
    const src = fs.readFileSync(path.join(root, "public/app.js"), "utf8");
    assert.doesNotMatch(src, /\balert\s*\(/);
    assert.doesNotMatch(src, /\bconfirm\s*\(/);
  });

  it("index provides dialog modal markup", () => {
    const html = fs.readFileSync(path.join(root, "public/index.html"), "utf8");
    assert.match(html, /id="dialog-modal"/);
    assert.match(html, /id="dialog-ok"/);
    assert.match(html, /id="dialog-confirm"/);
    assert.match(html, /id="dialog-cancel"/);
  });
});
