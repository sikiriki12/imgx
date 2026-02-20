import type { ImgxOptions } from "./types.ts";
import { EXIT_INPUT_ERROR, EXIT_API_ERROR } from "./types.ts";
import { createClient, buildConfig } from "./client.ts";
import { loadImagePart } from "./input.ts";
import { parseResponse, saveImages, formatOutput } from "./output.ts";

export async function analyzeCommand(
  args: string[],
  opts: ImgxOptions
): Promise<void> {
  if (args.length < 2) {
    console.error("Error: Need at least one image and a prompt.");
    console.error("Usage: imgx analyze <image...> \"<prompt>\"");
    process.exit(EXIT_INPUT_ERROR);
  }

  const prompt = args[args.length - 1];
  const imageSources = args.slice(0, -1);

  const client = createClient();
  const imageParts = await Promise.all(imageSources.map(loadImagePart));

  try {
    const response = await client.models.generateContent({
      model: opts.model,
      contents: [...imageParts, { text: prompt }],
      config: buildConfig(opts),
    });

    const parsed = parseResponse(response);
    await saveImages(parsed, opts.images);
    formatOutput(parsed, opts);
  } catch (err: any) {
    console.error(`API Error: ${err.message ?? err}`);
    process.exit(EXIT_API_ERROR);
  }
}
