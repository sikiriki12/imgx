import { existsSync } from "fs";
import { resolve } from "path";
import type { Part } from "@google/genai";
import { EXIT_INPUT_ERROR } from "./types.ts";

const MIME_EXTENSIONS: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".bmp": "image/bmp",
  ".tiff": "image/tiff",
  ".tif": "image/tiff",
  ".svg": "image/svg+xml",
};

export function detectMimeFromBytes(bytes: Uint8Array): string | null {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return "image/gif";
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "image/webp";
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) return "image/bmp";
  return null;
}

export function mimeFromExtension(path: string): string {
  const ext = path.toLowerCase().match(/\.[^.]+$/)?.[0] ?? "";
  return MIME_EXTENSIONS[ext] ?? "image/jpeg";
}

function toBase64(buffer: ArrayBuffer): string {
  return Buffer.from(buffer).toString("base64");
}

function makePart(data: string, mimeType: string): Part {
  return { inlineData: { data, mimeType } };
}

async function loadFromFile(filePath: string): Promise<Part> {
  const resolved = resolve(filePath);
  if (!existsSync(resolved)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(EXIT_INPUT_ERROR);
  }
  const file = Bun.file(resolved);
  const buffer = await file.arrayBuffer();
  if (buffer.byteLength === 0) {
    console.error(`Error: File is empty: ${filePath}`);
    process.exit(EXIT_INPUT_ERROR);
  }
  const bytes = new Uint8Array(buffer);
  const mimeType = detectMimeFromBytes(bytes) ?? mimeFromExtension(filePath);
  return makePart(toBase64(buffer), mimeType);
}

async function loadFromUrl(url: string): Promise<Part> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch (err: any) {
    console.error(`Error: Failed to fetch image: ${url}`);
    console.error(err.message ?? err);
    process.exit(EXIT_INPUT_ERROR);
  }
  if (!response.ok) {
    console.error(`Error: Failed to fetch image: ${url} (${response.status})`);
    process.exit(EXIT_INPUT_ERROR);
  }
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength === 0) {
    console.error(`Error: Fetched image is empty: ${url}`);
    process.exit(EXIT_INPUT_ERROR);
  }
  const contentType = response.headers.get("content-type")?.split(";")[0] ?? "";
  const bytes = new Uint8Array(buffer);
  const mimeType = detectMimeFromBytes(bytes) ?? (contentType.startsWith("image/") ? contentType : "image/jpeg");
  return makePart(toBase64(buffer), mimeType);
}

async function loadFromStdin(): Promise<Part> {
  const buffer = await Bun.stdin.arrayBuffer();
  if (buffer.byteLength === 0) {
    console.error("Error: No data received from stdin");
    process.exit(EXIT_INPUT_ERROR);
  }
  const bytes = new Uint8Array(buffer);
  const mimeType = detectMimeFromBytes(bytes) ?? "image/png";
  return makePart(toBase64(buffer), mimeType);
}

async function loadFromClipboard(): Promise<Part> {
  const tmpPath = `/tmp/imgx-clipboard-${Date.now()}.png`;
  const script = `
    set theFile to open for access POSIX file "${tmpPath}" with write permission
    try
      set theData to the clipboard as «class PNGf»
      write theData to theFile
      close access theFile
    on error
      close access theFile
      error "No image data in clipboard"
    end try
  `;
  const proc = Bun.spawn(["osascript", "-e", script], {
    stderr: "pipe",
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    console.error(`Error: No image data in clipboard`);
    if (stderr.trim()) console.error(stderr.trim());
    process.exit(EXIT_INPUT_ERROR);
  }
  const part = await loadFromFile(tmpPath);
  // Clean up temp file
  try { await Bun.file(tmpPath).exists() && (await import("fs")).unlinkSync(tmpPath); } catch {}
  return part;
}

export async function loadImagePart(source: string): Promise<Part> {
  if (source === "-") return loadFromStdin();
  if (source === "clipboard") return loadFromClipboard();
  if (source.startsWith("http://") || source.startsWith("https://")) return loadFromUrl(source);
  return loadFromFile(source);
}
