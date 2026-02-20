import { join } from "path";
import { mkdirSync, existsSync } from "fs";
import type { GenerateContentResponse } from "@google/genai";
import type { ParsedPart, ImgxOptions } from "./types.ts";

export function parseResponse(response: GenerateContentResponse): ParsedPart[] {
  const parts: ParsedPart[] = [];
  const candidates = response.candidates;
  if (!candidates?.length) return parts;

  for (const part of candidates[0].content?.parts ?? []) {
    if (part.thought && part.text) {
      parts.push({ type: "thought", content: part.text });
    } else if (part.text) {
      parts.push({ type: "text", content: part.text });
    } else if (part.executableCode?.code) {
      parts.push({ type: "code", content: part.executableCode.code });
    } else if (part.codeExecutionResult) {
      parts.push({ type: "result", content: part.codeExecutionResult.output ?? "" });
    } else if (part.inlineData?.data) {
      parts.push({
        type: "image",
        content: "",
        mimeType: part.inlineData.mimeType,
        data: part.inlineData.data,
      });
    }
  }
  return parts;
}

export async function saveImages(
  parts: ParsedPart[],
  outputDir: string
): Promise<string[]> {
  const imageParts = parts.filter((p) => p.type === "image");
  if (!imageParts.length) return [];

  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const paths: string[] = [];
  for (const img of imageParts) {
    const ext = img.mimeType?.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
    const filename = `imgx-${Date.now()}-${paths.length}.${ext}`;
    const filepath = join(outputDir, filename);
    const buffer = Buffer.from(img.data!, "base64");
    await Bun.write(filepath, buffer);
    paths.push(filepath);
    console.error(`Saved: ${filepath}`);
  }
  return paths;
}

export function formatOutput(parts: ParsedPart[], opts: ImgxOptions): void {
  if (opts.json) {
    console.log(JSON.stringify(parts, null, 2));
    return;
  }

  if (opts.quiet) return;

  if (opts.code) {
    for (const p of parts) {
      if (p.type === "code") console.log(p.content);
    }
    return;
  }

  if (opts.verbose) {
    for (const p of parts) {
      switch (p.type) {
        case "thought":
          console.log(`\n--- Thinking ---\n${p.content}`);
          break;
        case "text":
          console.log(p.content);
          break;
        case "code":
          console.log(`\n\`\`\`python\n${p.content}\n\`\`\``);
          break;
        case "result":
          console.log(`\n--- Execution Result ---\n${p.content}`);
          break;
        case "image":
          console.log("[Generated image saved]");
          break;
      }
    }
    return;
  }

  // Default: clean text only
  for (const p of parts) {
    if (p.type === "text") console.log(p.content);
  }
}
