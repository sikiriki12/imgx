import * as readline from "readline";
import type { ImgxOptions } from "./types.ts";
import { EXIT_API_ERROR } from "./types.ts";
import { createClient, buildConfig } from "./client.ts";
import { loadImagePart } from "./input.ts";
import { parseResponse, saveImages, formatOutput } from "./output.ts";

export async function chatCommand(
  imageSource: string,
  prompt: string | undefined,
  opts: ImgxOptions
): Promise<void> {
  const client = createClient();
  const imagePart = await loadImagePart(imageSource);
  const config = buildConfig(opts);

  const chat = client.chats.create({
    model: opts.model,
    config,
  });

  const initialPrompt = prompt ?? "I've loaded this image. What would you like to know?";

  // Send first message with image
  try {
    const firstResponse = await chat.sendMessage({
      message: [imagePart, { text: initialPrompt }],
    });

    const firstParsed = parseResponse(firstResponse);
    await saveImages(firstParsed, opts.images);
    formatOutput(firstParsed, opts);
  } catch (err: any) {
    console.error(`API Error: ${err.message ?? err}`);
    process.exit(EXIT_API_ERROR);
  }

  // REPL loop
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
    prompt: "\nimgx> ",
  });

  rl.prompt();

  rl.on("line", async (line: string) => {
    const input = line.trim();
    if (!input || input === "exit" || input === "quit") {
      rl.close();
      return;
    }

    try {
      const response = await chat.sendMessage({ message: input });
      const parsed = parseResponse(response);
      await saveImages(parsed, opts.images);
      formatOutput(parsed, opts);
    } catch (err: any) {
      console.error(`Error: ${err.message ?? err}`);
    }

    rl.prompt();
  });

  rl.on("close", () => {
    process.exit(0);
  });
}
