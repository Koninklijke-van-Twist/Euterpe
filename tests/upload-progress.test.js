import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { overallUploadProgress } from "../public/upload-progress.js";

const root = path.resolve(import.meta.dirname, "..");

describe("overallUploadProgress", () => {
  it("combines completed files with current file fraction", () => {
    assert.equal(overallUploadProgress(0, 100, 40, 0.5), 0.2);
    assert.equal(overallUploadProgress(40, 100, 60, 0.5), 0.7);
    assert.equal(overallUploadProgress(100, 100, 10, 0), 1);
  });

  it("clamps at 100%", () => {
    assert.equal(overallUploadProgress(90, 100, 20, 1), 1);
  });

  it("falls back to file count when total size is zero", () => {
    assert.equal(overallUploadProgress(0, 0, 0, 0.5, 1, 4), 0.375);
  });
});

describe("upload modal ui", () => {
  it("index provides upload modal markup", () => {
    const html = fs.readFileSync(path.join(root, "public/index.html"), "utf8");
    assert.match(html, /id="upload-modal"/);
    assert.match(html, /id="upload-progress-fill"/);
  });

  it("app uses xhr upload progress", () => {
    const src = fs.readFileSync(path.join(root, "public/app.js"), "utf8");
    assert.match(src, /uploadFileWithProgress/);
    assert.match(src, /overallUploadProgress/);
  });
});
