import { analyzeSpace, createMockDeps, createOpenRouterDeps, mockAnalysis, OpenRouter, type EditDeps, type SpaceAnalysis } from "@architech/ai";
import { aiReady, env } from "./env";
import { HttpError } from "./http";

export interface AiProvider {
  analyze(photo: Buffer): Promise<SpaceAnalysis>;
  deps(userId: string): EditDeps;
}

let override: AiProvider | null = null;
/** Lets tests swap in a fake provider. */
export function setAiProvider(p: AiProvider | null) {
  override = p;
}

export function ai(): AiProvider {
  if (override) return override;
  const e = env();
  if (e.AI_PROVIDER === "mock") return { analyze: async () => mockAnalysis(), deps: () => createMockDeps() };
  if (!aiReady(e)) throw new HttpError(503, "The AI isn't set up yet. Add OPENROUTER_API_KEY to the server settings.", "ai_not_configured");
  const or = new OpenRouter({ apiKey: e.OPENROUTER_API_KEY, appUrl: e.APP_URL });
  const models = { vision: e.AI_VISION_MODEL, image: e.AI_IMAGE_MODEL };
  return {
    analyze: (photo) => analyzeSpace(or, models, photo),
    deps: (userId) => createOpenRouterDeps(or, models, userId),
  };
}
