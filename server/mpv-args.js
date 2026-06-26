/** @param {{ ipc: string, isWindows: boolean, mpvAo: string | null, mpvExtraArgs: string[] }} opts */
export function buildMpvArgs({ ipc, isWindows, mpvAo, mpvExtraArgs }) {
  const args = [
    ...(isWindows ? ["--process-instance=multi"] : []),
    "--idle=yes",
    "--keep-open=yes",
    "--loop-file=no",
    "--loop-playlist=no",
    `--input-ipc-server=${ipc}`,
    "--volume=75",
    "--no-video",
    "--force-window=no",
  ];
  if (mpvAo) args.push(`--ao=${mpvAo}`);
  if (mpvExtraArgs.length) args.push(...mpvExtraArgs);
  return args;
}

/** mpv/OpenAL Soft probeert PipeWire; onder systemd faalt dat vaak (errno 112). */
export function isBenignMpvStderr(line) {
  return /\[ALSOFT\].*PipeWire/i.test(line);
}
