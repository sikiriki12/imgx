import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { tmpdir } from "os";
import { join } from "path";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { detectMimeFromBytes, mimeFromExtension, loadImagePart } from "./input.ts";

// ---- detectMimeFromBytes ----

describe("detectMimeFromBytes", () => {
  it("detects PNG", () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(detectMimeFromBytes(bytes)).toBe("image/png");
  });

  it("detects JPEG", () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(detectMimeFromBytes(bytes)).toBe("image/jpeg");
  });

  it("detects GIF", () => {
    const bytes = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
    expect(detectMimeFromBytes(bytes)).toBe("image/gif");
  });

  it("detects WebP", () => {
    // RIFF....WEBP
    const bytes = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, // RIFF
      0x00, 0x00, 0x00, 0x00, // size
      0x57, 0x45, 0x42, 0x50, // WEBP
    ]);
    expect(detectMimeFromBytes(bytes)).toBe("image/webp");
  });

  it("detects BMP", () => {
    const bytes = new Uint8Array([0x42, 0x4d, 0x00, 0x00]);
    expect(detectMimeFromBytes(bytes)).toBe("image/bmp");
  });

  it("returns null for unknown bytes", () => {
    const bytes = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
    expect(detectMimeFromBytes(bytes)).toBeNull();
  });

  it("returns null for empty bytes", () => {
    const bytes = new Uint8Array([]);
    expect(detectMimeFromBytes(bytes)).toBeNull();
  });
});

// ---- mimeFromExtension ----

describe("mimeFromExtension", () => {
  it("detects .jpg", () => {
    expect(mimeFromExtension("photo.jpg")).toBe("image/jpeg");
  });

  it("detects .jpeg", () => {
    expect(mimeFromExtension("photo.jpeg")).toBe("image/jpeg");
  });

  it("detects .png", () => {
    expect(mimeFromExtension("image.png")).toBe("image/png");
  });

  it("detects .webp", () => {
    expect(mimeFromExtension("file.webp")).toBe("image/webp");
  });

  it("detects .gif", () => {
    expect(mimeFromExtension("anim.gif")).toBe("image/gif");
  });

  it("detects .svg", () => {
    expect(mimeFromExtension("icon.svg")).toBe("image/svg+xml");
  });

  it("is case-insensitive", () => {
    expect(mimeFromExtension("PHOTO.JPG")).toBe("image/jpeg");
    expect(mimeFromExtension("image.PNG")).toBe("image/png");
  });

  it("handles paths with directories", () => {
    expect(mimeFromExtension("/some/path/to/file.png")).toBe("image/png");
  });

  it("defaults to image/jpeg for unknown extension", () => {
    expect(mimeFromExtension("file.xyz")).toBe("image/jpeg");
  });

  it("defaults to image/jpeg for no extension", () => {
    expect(mimeFromExtension("noext")).toBe("image/jpeg");
  });
});

// ---- loadImagePart (file loading) ----

describe("loadImagePart", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "imgx-input-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("loads a PNG file and returns inlineData part", async () => {
    // Minimal valid PNG (1x1 pixel)
    const pngBytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
      "base64"
    );
    const filePath = join(tmpDir, "test.png");
    writeFileSync(filePath, pngBytes);

    const part = await loadImagePart(filePath);
    expect(part.inlineData).toBeDefined();
    expect(part.inlineData!.mimeType).toBe("image/png");
    expect(part.inlineData!.data).toBeTruthy();

    // Verify the base64 round-trips correctly
    const decoded = Buffer.from(part.inlineData!.data!, "base64");
    expect(decoded.length).toBe(pngBytes.length);
  });

  it("loads a JPEG file (detected by magic bytes)", async () => {
    // JPEG header + some padding
    const jpegBytes = Buffer.alloc(32);
    jpegBytes[0] = 0xff;
    jpegBytes[1] = 0xd8;
    jpegBytes[2] = 0xff;
    jpegBytes[3] = 0xe0;
    const filePath = join(tmpDir, "test.dat"); // wrong extension, but magic bytes win
    writeFileSync(filePath, jpegBytes);

    const part = await loadImagePart(filePath);
    expect(part.inlineData!.mimeType).toBe("image/jpeg");
  });

  it("falls back to extension when magic bytes don't match", async () => {
    const filePath = join(tmpDir, "test.webp");
    writeFileSync(filePath, Buffer.from("not-a-real-webp-but-has-data"));

    const part = await loadImagePart(filePath);
    expect(part.inlineData!.mimeType).toBe("image/webp");
  });

  it("returns inlineData with correct structure", async () => {
    const pngBytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
      "base64"
    );
    const filePath = join(tmpDir, "struct.png");
    writeFileSync(filePath, pngBytes);

    const part = await loadImagePart(filePath);
    expect(part).toHaveProperty("inlineData");
    expect(part.inlineData).toHaveProperty("data");
    expect(part.inlineData).toHaveProperty("mimeType");
    expect(typeof part.inlineData!.data).toBe("string");
    expect(typeof part.inlineData!.mimeType).toBe("string");
  });
});
