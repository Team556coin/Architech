import { OpenRouter, designResponseSchema, decodeDesignResponse } from "../packages/ai/src/index.ts";
import { designItemSchema, newDesignItem } from "../packages/core/src/index.ts";
import { z } from "zod";
if (!process.argv.includes("--live")) throw new Error("Pass --live for a paid model check.");
const or = new OpenRouter({ apiKey: process.env.OPENROUTER_API_KEY!, fetch: async (...args) => {
  const response = await fetch(...args);
  if (!response.ok) console.error(JSON.stringify((await response.clone().json()).error));
  return response;
} });
const result = await or.chatJson({ model: process.env.AI_VISION_MODEL ?? "google/gemini-4-argon", schemaName: "design_update", schema: designResponseSchema, system: "Edit only the requested dimension. Return all item fields unchanged otherwise. Dimensions are meters. Return options as key/value entries.", text: JSON.stringify({ request: "Make this exactly sixteen feet wide", item: newDesignItem("patio-cover", "cover") }) });
console.log(JSON.stringify(decodeDesignResponse(result)));
