import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { buildConfig } from "./client.ts";
import type { ImgxOptions } from "./types.ts";

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

describe("buildConfig", () => {
  it("always includes code execution tool", () => {
    const config = buildConfig(defaultOpts());
    expect(config.tools).toEqual([{ codeExecution: {} }]);
  });

  it("always includes thinking config", () => {
    const config = buildConfig(defaultOpts());
    expect(config.thinkingConfig).toEqual({ includeThoughts: true });
  });

  it("does not include systemInstruction when not set", () => {
    const config = buildConfig(defaultOpts());
    expect("systemInstruction" in config).toBe(false);
  });

  it("includes systemInstruction when --system is set", () => {
    const config = buildConfig(defaultOpts({ system: "You are a helpful assistant" }));
    expect((config as any).systemInstruction).toBe("You are a helpful assistant");
  });

  it("does not include httpOptions when no timeout", () => {
    const config = buildConfig(defaultOpts());
    expect("httpOptions" in config).toBe(false);
  });

  it("includes httpOptions.timeout in milliseconds when --timeout is set", () => {
    const config = buildConfig(defaultOpts({ timeout: 30 }));
    expect((config as any).httpOptions.timeout).toBe(30000);
  });

  it("converts fractional timeout correctly", () => {
    const config = buildConfig(defaultOpts({ timeout: 1.5 }));
    expect((config as any).httpOptions.timeout).toBe(1500);
  });
});
