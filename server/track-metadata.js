import path from "node:path";

/**
 * Parse "Artist - Title" / "01. Artist - Title" from a filename (no extension).
 * @returns {{ title: string, artist: string | null }}
 */
export function parseFilenameMetadata(originalName) {
  const base = path.basename(String(originalName || ""), path.extname(String(originalName || "")));
  const cleaned = base.replace(/^\d+[\s.\-_]+/, "").trim();
  const sep = cleaned.match(/\s+[-–—]\s+/);
  if (!sep) return { title: cleaned || base || "Onbekend", artist: null };
  const idx = cleaned.search(/\s+[-–—]\s+/);
  const artist = cleaned.slice(0, idx).trim();
  const title = cleaned.slice(idx).replace(/^\s+[-–—]\s+/, "").trim();
  if (!artist || !title) return { title: cleaned || base || "Onbekend", artist: null };
  return { title, artist };
}

function synchsafe(b0, b1, b2, b3) {
  return ((b0 & 0x7f) << 21) | ((b1 & 0x7f) << 14) | ((b2 & 0x7f) << 7) | (b3 & 0x7f);
}

function decodeId3Text(buf) {
  if (!buf?.length) return null;
  const encoding = buf[0];
  const data = buf.subarray(1);
  try {
    if (encoding === 0) {
      return Buffer.from(data).toString("latin1").replace(/\0+$/g, "").trim() || null;
    }
    if (encoding === 1) {
      // UTF-16 with BOM
      let offset = 0;
      let little = true;
      if (data.length >= 2) {
        if (data[0] === 0xff && data[1] === 0xfe) {
          little = true;
          offset = 2;
        } else if (data[0] === 0xfe && data[1] === 0xff) {
          little = false;
          offset = 2;
        }
      }
      const chars = [];
      for (let i = offset; i + 1 < data.length; i += 2) {
        const code = little ? data[i] | (data[i + 1] << 8) : (data[i] << 8) | data[i + 1];
        if (code === 0) break;
        chars.push(String.fromCharCode(code));
      }
      return chars.join("").trim() || null;
    }
    if (encoding === 2) {
      const chars = [];
      for (let i = 0; i + 1 < data.length; i += 2) {
        const code = (data[i] << 8) | data[i + 1];
        if (code === 0) break;
        chars.push(String.fromCharCode(code));
      }
      return chars.join("").trim() || null;
    }
    if (encoding === 3) {
      return Buffer.from(data).toString("utf8").replace(/\0+$/g, "").trim() || null;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Read basic ID3v2 text frames from an audio buffer (TIT2, TPE1, TALB).
 * @param {Buffer|Uint8Array} buffer
 */
export function parseId3Metadata(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  if (buf.length < 10 || buf.toString("ascii", 0, 3) !== "ID3") {
    return { title: null, artist: null, album: null };
  }

  const major = buf[3];
  const tagSize = synchsafe(buf[6], buf[7], buf[8], buf[9]);
  let offset = 10;
  // skip extended header if present (v2.3/v2.4)
  const flags = buf[5];
  if (flags & 0x40) {
    if (major === 4) {
      const extSize = synchsafe(buf[offset], buf[offset + 1], buf[offset + 2], buf[offset + 3]);
      offset += extSize;
    } else {
      const extSize = buf.readUInt32BE(offset);
      offset += 4 + extSize;
    }
  }

  const end = Math.min(buf.length, 10 + tagSize);
  const frames = {};

  while (offset + 10 <= end) {
    const id = buf.toString("ascii", offset, offset + 4);
    if (!/^[A-Z0-9]{4}$/.test(id)) break;

    let size;
    if (major === 4) {
      size = synchsafe(buf[offset + 4], buf[offset + 5], buf[offset + 6], buf[offset + 7]);
    } else {
      size = buf.readUInt32BE(offset + 4);
    }
    if (size <= 0 || offset + 10 + size > end) break;

    const body = buf.subarray(offset + 10, offset + 10 + size);
    if (id === "TIT2" || id === "TPE1" || id === "TALB") {
      frames[id] = decodeId3Text(body);
    }
    offset += 10 + size;
  }

  return {
    title: frames.TIT2 || null,
    artist: frames.TPE1 || null,
    album: frames.TALB || null,
  };
}

/**
 * Prefer ID3 tags; fall back to filename "Artist - Title".
 * @param {Buffer|Uint8Array} buffer
 * @param {string} originalName
 */
export function extractTrackMetadata(buffer, originalName) {
  const fromFile = parseFilenameMetadata(originalName);
  const fromId3 = parseId3Metadata(buffer);
  return {
    title: fromId3.title || fromFile.title,
    artist: fromId3.artist || fromFile.artist,
    album: fromId3.album || null,
  };
}
