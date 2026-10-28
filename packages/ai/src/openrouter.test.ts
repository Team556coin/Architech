import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { OpenRouter, OpenRouterError } from "./openrouter";

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

describe("OpenRouter.chatJson", () => {
  it("sends images and a strict JSON schema, then validates the answer", async () => {
    const fetch = vi.fn().mockResolvedValue(ok({ choices: [{ message: { content: '{"spaceType":"bathroom","count":2}' } }] }));
    const or = new OpenRouter({ apiKey: "k", fetch, appUrl: "http://x" });
    const out = await or.chatJson({
      model: "google/gemini-4-argon",
      system: "sys",
      text: "look",
      images: ["data:image/jpeg;base64,AAAA"],
      schemaName: "space",
      schema: z.object({ spaceType: z.string(), count: z.number() }),
    });
    expect(out).toEqual({ spaceType: "bathroom", count: 2 });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    const body = JSON.parse(init.body);
    expect(init.headers.Authorization).toBe("Bearer k");
    expect(body.model).toBe("google/gemini-4-argon");
    expect(body.response_format.type).toBe("json_schema");
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.response_format.json_schema.schema.additionalProperties).toBe(false);
    const user = body.messages[1];
    expect(user.content[1]).toEqual({ type: "image_url", image_url: { url: "data:image/jpeg;base64,AAAA" } });
  });

  it("extracts JSON wrapped in a code fence and retries once on invalid output", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(ok({ choices: [{ message: { content: "not json" } }] }))
      .mockResolvedValueOnce(ok({ choices: [{ message: { content: '```json\n{"a":1}\n```' } }] }));
    const or = new OpenRouter({ apiKey: "k", fetch });
    const out = await or.chatJson({ model: "m", system: "s", text: "t", schemaName: "x", schema: z.object({ a: z.number() }) });
    expect(out).toEqual({ a: 1 });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("retries rate limits and surfaces other errors", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("slow down", { status: 429 }))
      .mockResolvedValueOnce(ok({ choices: [{ message: { content: '{"a":1}' } }] }));
    const or = new OpenRouter({ apiKey: "k", fetch, retryDelayMs: 1 });
    await expect(or.chatJson({ model: "m", system: "s", text: "t", schemaName: "x", schema: z.object({ a: z.number() }) })).resolves.toEqual({ a: 1 });

    const bad = new OpenRouter({ apiKey: "k", fetch: vi.fn().mockResolvedValue(new Response('{"error":{"message":"no credits"}}', { status: 402 })), retryDelayMs: 1 });
    await expect(bad.chatJson({ model: "m", system: "s", text: "t", schemaName: "x", schema: z.object({ a: z.number() }) })).rejects.toBeInstanceOf(OpenRouterError);
  });
});

describe("OpenRouter.generateImage", () => {
  it("posts reference images to the Image API and decodes the result", async () => {
    const png = Buffer.from("fake-png");
    const fetch = vi.fn().mockResolvedValue(ok({ data: [{ b64_json: png.toString("base64"), media_type: "image/png" }], usage: { cost: 0.04 } }));
    const or = new OpenRouter({ apiKey: "k", fetch });
    const out = await or.generateImage({
      model: "openai/gpt-image-2.5-sunburst",
      prompt: "add a fence",
      images: [Buffer.from("a"), Buffer.from("b")],
      aspectRatio: "3:2",
      quality: "high",
    });
    expect(out.image.equals(png)).toBe(true);
    expect(out.costUsd).toBe(0.04);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("https://openrouter.ai/api/v1/images");
    const body = JSON.parse(init.body);
    expect(body.input_references).toHaveLength(2);
    expect(body.input_references[0].image_url.url).toMatch(/^data:image\/jpeg;base64,/);
    expect(body.aspect_ratio).toBe("3:2");
    expect(body.n).toBe(1);
  });

  it("throws when no image comes back", async () => {
    const or = new OpenRouter({ apiKey: "k", fetch: vi.fn().mockResolvedValue(ok({ data: [] })) });
    await expect(or.generateImage({ model: "m", prompt: "p", images: [], aspectRatio: "1:1" })).rejects.toThrow(/no image/i);
  });
});
