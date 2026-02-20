import { describe, it, expect, spyOn, beforeEach, afterEach } from "bun:test";
import { tmpdir } from "os";
import { join } from "path";
import { mkdtempSync, existsSync, readFileSync, rmSync } from "fs";
import { parseResponse, saveImages, formatOutput } from "./output.ts";
import type { ParsedPart, ImgxOptions } from "./types.ts";
import type { GenerateContentResponse } from "@google/genai";

// Helper to build a mock response
function mockResponse(parts: any[]): GenerateContentResponse {
  return {
    candidates: [{ content: { parts } }],
  } as unknown as GenerateContentResponse;
}

function defaultOpts(overrides: Partial<ImgxOptions> = {}): ImgxOptions {
  return {
    verbose: false,
    code: false,
    images: ".",
    json: false,
    quiet: false,
    model: "gemini-3-flash-preview",
    ...overrides,
  };
}

// ---- parseResponse ----

describe("parseResponse", () => {
  it("returns empty array for no candidates", () => {
    const resp = { candidates: [] } as unknown as GenerateContentResponse;
    expect(parseResponse(resp)).toEqual([]);
  });

  it("returns empty array for null candidates", () => {
    const resp = {} as unknown as GenerateContentResponse;
    expect(parseResponse(resp)).toEqual([]);
  });

  it("parses text parts", () => {
    const resp = mockResponse([{ text: "Hello world" }]);
    const parts = parseResponse(resp);
    expect(parts).toEqual([{ type: "text", content: "Hello world" }]);
  });

  it("parses thought parts (thought=true + text)", () => {
    const resp = mockResponse([{ thought: true, text: "Let me think..." }]);
    const parts = parseResponse(resp);
    expect(parts).toEqual([{ type: "thought", content: "Let me think..." }]);
  });

  it("distinguishes thought from regular text", () => {
    const resp = mockResponse([
      { thought: true, text: "thinking..." },
      { text: "answer" },
    ]);
    const parts = parseResponse(resp);
    expect(parts).toHaveLength(2);
    expect(parts[0].type).toBe("thought");
    expect(parts[1].type).toBe("text");
  });

  it("parses executableCode parts", () => {
    const resp = mockResponse([
      { executableCode: { code: "print('hello')", language: "PYTHON" } },
    ]);
    const parts = parseResponse(resp);
    expect(parts).toEqual([{ type: "code", content: "print('hello')" }]);
  });

  it("parses codeExecutionResult parts", () => {
    const resp = mockResponse([
      { codeExecutionResult: { outcome: "OUTCOME_OK", output: "hello\n" } },
    ]);
    const parts = parseResponse(resp);
    expect(parts).toEqual([{ type: "result", content: "hello\n" }]);
  });

  it("handles codeExecutionResult with no output", () => {
    const resp = mockResponse([
      { codeExecutionResult: { outcome: "OUTCOME_OK" } },
    ]);
    const parts = parseResponse(resp);
    expect(parts).toEqual([{ type: "result", content: "" }]);
  });

  it("parses inlineData (image) parts", () => {
    const resp = mockResponse([
      { inlineData: { mimeType: "image/png", data: "abc123==" } },
    ]);
    const parts = parseResponse(resp);
    expect(parts).toEqual([
      { type: "image", content: "", mimeType: "image/png", data: "abc123==" },
    ]);
  });

  it("parses a full multi-part response in order", () => {
    const resp = mockResponse([
      { thought: true, text: "I should analyze this" },
      { text: "Here's my analysis:" },
      { executableCode: { code: "import cv2", language: "PYTHON" } },
      { codeExecutionResult: { outcome: "OUTCOME_OK", output: "done" } },
      { inlineData: { mimeType: "image/png", data: "AAAA" } },
      { text: "The annotated image is above." },
    ]);
    const parts = parseResponse(resp);
    expect(parts).toHaveLength(6);
    expect(parts.map((p) => p.type)).toEqual([
      "thought",
      "text",
      "code",
      "result",
      "image",
      "text",
    ]);
  });
});

// ---- saveImages ----

describe("saveImages", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "imgx-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns empty array when no image parts", async () => {
    const parts: ParsedPart[] = [{ type: "text", content: "hello" }];
    const paths = await saveImages(parts, tmpDir);
    expect(paths).toEqual([]);
  });

  it("saves a PNG image and returns path", async () => {
    const pngBase64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";
    const parts: ParsedPart[] = [
      { type: "image", content: "", mimeType: "image/png", data: pngBase64 },
    ];

    const spy = spyOn(console, "error").mockImplementation(() => {});
    try {
      const paths = await saveImages(parts, tmpDir);
      expect(paths).toHaveLength(1);
      expect(paths[0]).toContain("imgx-");
      expect(paths[0]).toEndWith(".png");
      expect(existsSync(paths[0])).toBe(true);
      const written = readFileSync(paths[0]);
      expect(written.toString("base64")).toBe(pngBase64);
    } finally {
      spy.mockRestore();
    }
  });

  it("saves multiple images", async () => {
    const b64 = Buffer.from("fake-image").toString("base64");
    const parts: ParsedPart[] = [
      { type: "image", content: "", mimeType: "image/png", data: b64 },
      { type: "text", content: "some text" },
      { type: "image", content: "", mimeType: "image/jpeg", data: b64 },
    ];

    const spy = spyOn(console, "error").mockImplementation(() => {});
    try {
      const paths = await saveImages(parts, tmpDir);
      expect(paths).toHaveLength(2);
      expect(paths[0]).toEndWith(".png");
      expect(paths[1]).toEndWith(".jpg");
    } finally {
      spy.mockRestore();
    }
  });

  it("creates output directory if it doesn't exist", async () => {
    const nestedDir = join(tmpDir, "sub", "dir");
    const b64 = Buffer.from("data").toString("base64");
    const parts: ParsedPart[] = [
      { type: "image", content: "", mimeType: "image/png", data: b64 },
    ];

    const spy = spyOn(console, "error").mockImplementation(() => {});
    try {
      await saveImages(parts, nestedDir);
      expect(existsSync(nestedDir)).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  it("prints saved paths to stderr", async () => {
    const b64 = Buffer.from("data").toString("base64");
    const parts: ParsedPart[] = [
      { type: "image", content: "", mimeType: "image/png", data: b64 },
    ];

    const spy = spyOn(console, "error").mockImplementation(() => {});
    try {
      const paths = await saveImages(parts, tmpDir);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0][0]).toContain("Saved:");
      expect(spy.mock.calls[0][0]).toContain(paths[0]);
    } finally {
      spy.mockRestore();
    }
  });
});

// ---- formatOutput ----

describe("formatOutput", () => {
  const mixedParts: ParsedPart[] = [
    { type: "thought", content: "thinking..." },
    { type: "text", content: "The answer is 42." },
    { type: "code", content: "print(42)" },
    { type: "result", content: "42\n" },
    { type: "image", content: "", mimeType: "image/png", data: "AAA" },
  ];

  it("default mode: prints only text parts", () => {
    const spy = spyOn(console, "log").mockImplementation(() => {});
    try {
      formatOutput(mixedParts, defaultOpts());
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0][0]).toBe("The answer is 42.");
    } finally {
      spy.mockRestore();
    }
  });

  it("--quiet: prints nothing", () => {
    const spy = spyOn(console, "log").mockImplementation(() => {});
    try {
      formatOutput(mixedParts, defaultOpts({ quiet: true }));
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it("--code: prints only code parts", () => {
    const spy = spyOn(console, "log").mockImplementation(() => {});
    try {
      formatOutput(mixedParts, defaultOpts({ code: true }));
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0][0]).toBe("print(42)");
    } finally {
      spy.mockRestore();
    }
  });

  it("--json: outputs JSON of all parts", () => {
    const spy = spyOn(console, "log").mockImplementation(() => {});
    try {
      formatOutput(mixedParts, defaultOpts({ json: true }));
      expect(spy).toHaveBeenCalledTimes(1);
      const output = JSON.parse(spy.mock.calls[0][0]);
      expect(output).toHaveLength(5);
      expect(output[0].type).toBe("thought");
      expect(output[1].type).toBe("text");
    } finally {
      spy.mockRestore();
    }
  });

  it("--verbose: prints all parts with labels", () => {
    const spy = spyOn(console, "log").mockImplementation(() => {});
    try {
      formatOutput(mixedParts, defaultOpts({ verbose: true }));
      expect(spy).toHaveBeenCalledTimes(5);
      expect(spy.mock.calls[0][0]).toContain("--- Thinking ---");
      expect(spy.mock.calls[1][0]).toBe("The answer is 42.");
      expect(spy.mock.calls[2][0]).toContain("```python");
      expect(spy.mock.calls[3][0]).toContain("--- Execution Result ---");
      expect(spy.mock.calls[4][0]).toBe("[Generated image saved]");
    } finally {
      spy.mockRestore();
    }
  });

  it("--verbose with multiple code blocks", () => {
    const parts: ParsedPart[] = [
      { type: "code", content: "x = 1" },
      { type: "result", content: "" },
      { type: "code", content: "x += 1" },
      { type: "result", content: "2" },
      { type: "text", content: "Done." },
    ];
    const spy = spyOn(console, "log").mockImplementation(() => {});
    try {
      formatOutput(parts, defaultOpts({ verbose: true }));
      expect(spy).toHaveBeenCalledTimes(5);
    } finally {
      spy.mockRestore();
    }
  });

  it("default mode with no text parts prints nothing", () => {
    const parts: ParsedPart[] = [
      { type: "code", content: "x = 1" },
      { type: "result", content: "1" },
    ];
    const spy = spyOn(console, "log").mockImplementation(() => {});
    try {
      formatOutput(parts, defaultOpts());
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});
