export interface ImgxOptions {
  verbose: boolean;
  code: boolean;
  images: string;
  json: boolean;
  quiet: boolean;
  model: string;
  system?: string;
  timeout?: number;
}

export interface ParsedPart {
  type: "text" | "thought" | "code" | "result" | "image";
  content: string;
  mimeType?: string;
  data?: string;
}

export const EXIT_SUCCESS = 0;
export const EXIT_API_ERROR = 1;
export const EXIT_INPUT_ERROR = 2;
