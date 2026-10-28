import { z } from "zod";

export class OpenRouterError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export interface OpenRouterOptions {
  apiKey: string;
  baseUrl?: string;
  appUrl?: string;
  fetch?: typeof fetch;
  retryDelayMs?: number;
}

export interface ChatJsonArgs<T extends z.ZodType> {
  model: string;
  system: string;
  text: string;
  /** data: URLs or https URLs */
  images?: string[];
  schemaName: string;
  schema: T;
  temperature?: number;
  timeoutMs?: number;
}

export interface GenerateImageArgs {
  model: string;
  prompt: string;
  images: Buffer[];
  aspectRatio: string;
  quality?: "auto" | "low" | "medium" | "high";
  user?: string;
  timeoutMs?: number;
}

const RETRY_STATUS = new Set([408, 429, 500, 502, 503, 504]);

export function toDataUrl(buf: Buffer): string {
  const isPng = buf.length > 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  const isWebp = buf.length > 12 && buf.subarray(8, 12).toString() === "WEBP";
  const type = isPng ? "image/png" : isWebp ? "image/webp" : "image/jpeg";
  return `data:${type};base64,${buf.toString("base64")}`;
}

/** JSON Schema suitable for strict structured outputs: no extra keys, every key required. */
export function strictJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema) as Record<string, unknown>;
  delete json.$schema;
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const n = node as Record<string, unknown>;
    if (n.type === "object" && n.properties && typeof n.properties === "object") {
      n.additionalProperties = false;
      n.required = Object.keys(n.properties as object);
    }
    for (const v of Object.values(n)) {
      if (Array.isArray(v)) v.forEach(walk);
      else walk(v);
    }
  };
  walk(json);
  return json;
}

function extractJson(content: string): unknown {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const text = (fenced ? fenced[1]! : content).trim();
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
    throw new Error("Model did not return JSON");
  }
}

function messageText(message: unknown): string {
  const m = message as { content?: unknown } | undefined;
  if (!m) return "";
  if (typeof m.content === "string") return m.content;
  if (Array.isArray(m.content)) return m.content.map((p: { text?: string }) => p?.text ?? "").join("");
  return "";
}

export class OpenRouter {
  private readonly base: string;
  private readonly f: typeof fetch;
  private readonly delay: number;

  constructor(private readonly opts: OpenRouterOptions) {
    this.base = (opts.baseUrl ?? "https://openrouter.ai/api/v1").replace(/\/$/, "");
    this.f = opts.fetch ?? fetch;
    this.delay = opts.retryDelayMs ?? 1500;
  }

  private async post(path: string, body: unknown, timeoutMs: number): Promise<unknown> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await this.f(`${this.base}${path}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.opts.apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": this.opts.appUrl ?? "https://architech.app",
            "X-Title": "Architech",
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (res.ok) return await res.json();
        const text = await res.text();
        let message = text;
        try {
          message = (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? text;
        } catch {
          /* plain text error */
        }
        lastErr = new OpenRouterError(`OpenRouter ${res.status}: ${message.slice(0, 300)}`, res.status);
        if (!RETRY_STATUS.has(res.status)) throw lastErr;
      } catch (e) {
        if (e instanceof OpenRouterError && !RETRY_STATUS.has(e.status)) throw e;
        lastErr = e;
      }
      await new Promise((r) => setTimeout(r, this.delay * (attempt + 1)));
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }

  async chatJson<T extends z.ZodType>(args: ChatJsonArgs<T>): Promise<z.infer<T>> {
    const content: unknown[] = [{ type: "text", text: args.text }];
    for (const url of args.images ?? []) content.push({ type: "image_url", image_url: { url } });
    const body = {
      model: args.model,
      temperature: args.temperature ?? 0.2,
      messages: [
        { role: "system", content: args.system },
        { role: "user", content },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: args.schemaName, strict: true, schema: strictJsonSchema(args.schema) },
      },
    };
    let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = (await this.post("/chat/completions", body, args.timeoutMs ?? 120_000)) as { choices?: { message?: unknown }[] };
      try {
        const parsed = extractJson(messageText(res.choices?.[0]?.message));
        return args.schema.parse(parsed);
      } catch (e) {
        lastErr = e;
      }
    }
    throw new Error(`AI returned an unexpected answer: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`);
  }

  async generateImage(args: GenerateImageArgs): Promise<{ image: Buffer; mediaType?: string; costUsd?: number }> {
    const body: Record<string, unknown> = {
      model: args.model,
      prompt: args.prompt,
      n: 1,
      aspect_ratio: args.aspectRatio,
      input_references: args.images.map((b) => ({ type: "image_url", image_url: { url: toDataUrl(b) } })),
    };
    if (args.quality) body.quality = args.quality;
    if (args.user) body.user = args.user;
    const res = (await this.post("/images", body, args.timeoutMs ?? 300_000)) as {
      data?: { b64_json?: string; media_type?: string }[];
      usage?: { cost?: number };
    };
    const first = res.data?.[0];
    if (!first?.b64_json) throw new Error("The AI returned no image. Please try again.");
    return { image: Buffer.from(first.b64_json, "base64"), mediaType: first.media_type, costUsd: res.usage?.cost };
  }
}
