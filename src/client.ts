import { GoogleGenAI } from "@google/genai";
import type { ImgxOptions } from "./types.ts";
import { EXIT_INPUT_ERROR } from "./types.ts";

export function createClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("Error: GEMINI_API_KEY environment variable is required.");
    console.error("Get your key at: https://aistudio.google.com/apikey");
    process.exit(EXIT_INPUT_ERROR);
  }
  return new GoogleGenAI({ apiKey });
}

export function buildConfig(opts: ImgxOptions) {
  return {
    tools: [{ codeExecution: {} }] as [{ codeExecution: {} }],
    thinkingConfig: {
      includeThoughts: true,
    },
    ...(opts.system ? { systemInstruction: opts.system } : {}),
    httpOptions: { timeout: (opts.timeout ?? 120) * 1000 },
  };
}
