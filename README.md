# imgx

CLI for Gemini's agentic vision — send images to Gemini 3 Flash with code execution and thinking enabled.

Gemini can analyze your images, write and run Python code to process them, and return annotated images, charts, and calculations — all from your terminal.

## Install

```bash
# Global install (requires Bun)
bun install -g .

# Or compile to a standalone binary
bun run build
# → produces ./imgx
```

Requires a Gemini API key:

```bash
export GEMINI_API_KEY="your-key-here"
# Get one at https://aistudio.google.com/apikey
```

## Commands

### `analyze` — one-shot image analysis

```bash
imgx analyze <image...> "<prompt>"
```

Send one or more images with a prompt. The last argument is always the prompt, everything before it is an image source.

```bash
# Single image
imgx analyze photo.jpg "What's in this image?"

# Multiple images
imgx analyze before.png after.png "What changed between these two?"

# URL
imgx analyze https://example.com/chart.png "Summarize this chart"

# Pipe from stdin
cat screenshot.png | imgx analyze - "Extract the text from this screenshot"

# macOS clipboard
imgx analyze clipboard "What is this?"

# Mix sources
imgx analyze photo.jpg https://example.com/ref.png "Compare these"
```

### `chat` — interactive multi-turn mode

```bash
imgx chat <image> [prompt]
```

Start a conversation about an image. Optionally pass an initial prompt to skip the generic opener.

```bash
# With an initial question
imgx chat dashboard.png "Which metric is trending down?"

# Without — opens with a neutral prompt, you ask the first question
imgx chat photo.jpg
```

Type follow-up questions at the `imgx>` prompt. Type `exit`, `quit`, or press Ctrl+D to end.

## Flags

All flags work with both `analyze` and `chat`.

| Flag | Description |
|------|-------------|
| (default) | Clean text output only — no thinking, code, or execution results |
| `-v, --verbose` | Show everything: thinking, generated code, execution results, text |
| `--code` | Print only the generated Python code blocks |
| `--json` | Full structured JSON output of all response parts |
| `-q, --quiet` | Suppress text output; only saved image paths are printed (to stderr) |
| `--images <dir>` | Directory to save generated images (default: `.`) |
| `--model <model>` | Override model (default: `gemini-3-flash-preview`) |
| `--system <prompt>` | System instruction |
| `--timeout <seconds>` | Request timeout |

## Output modes

By default, imgx prints only the final text — clean for piping and scripting:

```bash
imgx analyze chart.png "What's the trend?" > summary.txt
```

Use `--verbose` to see the full chain of thought:

```bash
imgx analyze photo.jpg "Count the people" -v
```

```
--- Thinking ---
I need to examine the image carefully and count each person...

```python
import cv2
# detection code...
```

--- Execution Result ---
Found 7 people in the image.

There are 7 people visible in the image.
```

Use `--code` to extract just the Python that Gemini wrote:

```bash
imgx analyze data.png "Parse this table into CSV" --code > extract.py
```

Use `--json` for programmatic access to all parts:

```bash
imgx analyze photo.jpg "Describe" --json | jq '.[] | select(.type == "text")'
```

## Generated images

When Gemini generates images (annotations, plots, charts), they're automatically saved to disk. Paths are printed to stderr so stdout stays clean:

```bash
imgx analyze photo.jpg "Draw bounding boxes around all faces" --images ./output
# stderr: Saved: ./output/imgx-1708000000000-0.png
```

With `--quiet`, only the saved paths appear (on stderr), nothing on stdout:

```bash
imgx analyze chart.png "Recreate this as a bar chart" -q --images ./plots
# stderr: Saved: ./plots/imgx-1708000000000-0.png
```

## Image sources

| Source | Example |
|--------|---------|
| Local file | `photo.jpg`, `./images/scan.png` |
| URL | `https://example.com/image.png` |
| Stdin | `cat img.png \| imgx analyze - "describe"` |
| Clipboard (macOS) | `imgx analyze clipboard "what is this?"` |

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | API error (rate limit, model error, timeout) |
| 2 | Input error (missing API key, file not found, bad args) |
