import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildMpvArgs, isBenignMpvStderr } from "../server/mpv-args.js";

describe("buildMpvArgs", () => {
  it("uses alsa audio output on linux by default", () => {
    const args = buildMpvArgs({
      ipc: "/tmp/mpv.sock",
      isWindows: false,
      mpvAo: "alsa",
      mpvExtraArgs: [],
    });
    assert.ok(args.includes("--ao=alsa"));
    assert.ok(args.includes("--input-ipc-server=/tmp/mpv.sock"));
  });

  it("omits ao flag when mpvAo is null", () => {
    const args = buildMpvArgs({
      ipc: "/tmp/mpv.sock",
      isWindows: false,
      mpvAo: null,
      mpvExtraArgs: [],
    });
    assert.equal(args.some((a) => a.startsWith("--ao=")), false);
  });

  it("appends extra mpv args", () => {
    const args = buildMpvArgs({
      ipc: "/tmp/mpv.sock",
      isWindows: true,
      mpvAo: null,
      mpvExtraArgs: ["--audio-device=alsa/default"],
    });
    assert.ok(args.includes("--process-instance=multi"));
    assert.ok(args.includes("--audio-device=alsa/default"));
  });
});

describe("isBenignMpvStderr", () => {
  it("filters OpenAL PipeWire connection noise", () => {
    assert.equal(
      isBenignMpvStderr("[ALSOFT] (EE) Failed to connect PipeWire event context (errno: 112)"),
      true
    );
    assert.equal(isBenignMpvStderr("[ffmpeg] something broke"), false);
  });
});
