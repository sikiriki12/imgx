#!/usr/bin/env bun

import { Command } from "commander";
import { analyzeCommand } from "./analyze.ts";
import { chatCommand } from "./chat.ts";
import type { ImgxOptions } from "./types.ts";

const program = new Command();

program
  .name("imgx")
  .description("CLI for Gemini vision with code execution")
  .version("0.1.0");

function addGlobalOptions(cmd: Command): Command {
  return cmd
    .option("-v, --verbose", "Show all response parts (thinking, code, results)", false)
    .option("--code", "Print only generated code blocks", false)
    .option("--images <dir>", "Save generated images to directory", ".")
    .option("--json", "Full structured JSON output", false)
    .option("-q, --quiet", "Suppress text output, only save images", false)
    .option("--model <model>", "Model to use", "gemini-3-flash-preview")
    .option("--system <prompt>", "System instruction")
    .option("--timeout <seconds>", "Request timeout in seconds (default: 120)", parseFloat);
}

const analyzeCmd = program
  .command("analyze")
  .description("Analyze image(s) with a prompt")
  .argument("<args...>", "image path(s)/URL(s) followed by prompt (last arg)");

addGlobalOptions(analyzeCmd);
analyzeCmd.action(async (args: string[], opts: ImgxOptions) => {
  await analyzeCommand(args, opts);
});

const chatCmd = program
  .command("chat")
  .description("Interactive multi-turn chat about an image")
  .argument("<image>", "image file, URL, -, or clipboard")
  .argument("[prompt]", "initial prompt (optional)");

addGlobalOptions(chatCmd);
chatCmd.action(async (image: string, prompt: string | undefined, opts: ImgxOptions) => {
  await chatCommand(image, prompt, opts);
});

program.parse();
