#!/usr/bin/env node
/**
 * Terminal Input Diagnostic Tool
 * Captures raw escape sequences from keyboard input.
 * Works with Node.js and Bun.
 *
 * Usage: bun diagnostic-keys.ts  (or node diagnostic-keys.ts)
 */

import * as process from "node:process";

function main() {
  // Enable raw mode (works in both Node.js and Bun when in TTY)
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }

  console.log("=== Terminal Input Diagnostic Tool ===");
  console.log("Press any keys to see their raw escape sequences.");
  console.log("Press Ctrl+C to exit.\n");

  let buffer = "";
  let sequenceTimeout: ReturnType<typeof setTimeout> | null = null;

  const printSequence = (raw: string) => {
    const hex = raw
      .split("")
      .map((c) => c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0"))
      .join(" ");

    const chars = raw
      .split("")
      .map((c) => {
        const code = c.charCodeAt(0);
        if (code === 27) return "ESC";
        if (code === 13) return "<CR>";
        if (code === 10) return "<LF>";
        if (code === 8) return "<BS>";
        if (code === 127) return "<DEL>";
        if (code < 32) return `^${String.fromCharCode(code + 64)}`;
        if (code >= 32 && code < 127) return c;
        return `<0x${code.toString(16).toUpperCase().padStart(2, "0")}>`;
      })
      .join("");

    console.log(`\n[RECEIVED] hex: ${hex}`);
    console.log(`[RECEIVED] chars: ${chars}`);
    console.log(`[RECEIVED] json: ${JSON.stringify(raw)}`);
    console.log("");
  };

  const handleChunk = (chunk: Buffer | Uint8Array | string) => {
    const str = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf-8");
    buffer += str;

    if (sequenceTimeout) clearTimeout(sequenceTimeout);

    // Wait 80ms to see if more escape sequence chars follow
    sequenceTimeout = setTimeout(() => {
      if (buffer.length > 0) {
        const fullBuffer = buffer;
        buffer = "";
        printSequence(fullBuffer);
      }
      sequenceTimeout = null;
    }, 80);
  };

  // Read raw bytes directly (bypasses Node's text decoding)
  // This is critical for capturing exact escape sequences
  process.stdin.on("data", (data: Buffer) => {
    // Process as raw bytes to preserve exact character codes
    let i = 0;
    while (i < data.length) {
      const byte = data[i];
      // Handle UTF-8 multi-byte sequences
      if (byte < 0x80) {
        // Single byte ASCII
        buffer += String.fromCharCode(byte);
        i++;
      } else if (byte < 0xC0) {
        // Continuation byte (shouldn't happen in well-formed UTF-8)
        buffer += String.fromCharCode(byte);
        i++;
      } else if (byte < 0xE0) {
        // 2-byte UTF-8
        if (i + 1 < data.length) {
          const code = ((byte & 0x1F) << 6) | (data[i + 1] & 0x3F);
          buffer += String.fromCodePoint(code);
          i += 2;
        } else {
          i++;
        }
      } else if (byte < 0xF0) {
        // 3-byte UTF-8
        if (i + 2 < data.length) {
          const code = ((byte & 0x0F) << 12) | ((data[i + 1] & 0x3F) << 6) | (data[i + 2] & 0x3F);
          buffer += String.fromCodePoint(code);
          i += 3;
        } else {
          i++;
        }
      } else {
        // 4-byte UTF-8
        if (i + 3 < data.length) {
          const code = ((byte & 0x07) << 18) | ((data[i + 1] & 0x3F) << 12) | ((data[i + 2] & 0x3F) << 6) | (data[i + 3] & 0x3F);
          buffer += String.fromCodePoint(code);
          i += 4;
        } else {
          i++;
        }
      }
    }

    if (sequenceTimeout) clearTimeout(sequenceTimeout);
    sequenceTimeout = setTimeout(() => {
      if (buffer.length > 0) {
        const fullBuffer = buffer;
        buffer = "";
        printSequence(fullBuffer);
      }
      sequenceTimeout = null;
    }, 80);
  });

  const exitHandler = () => {
    if (sequenceTimeout) clearTimeout(sequenceTimeout);
    process.stdin.setRawMode(false);
    console.log("\n\nExiting.\n");
    process.exit(0);
  };

  process.on("SIGINT", exitHandler);
  process.on("SIGTERM", exitHandler);
}

main();
