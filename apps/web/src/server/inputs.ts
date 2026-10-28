import { planningSchema, calibrationSchema, editRequestSchema, keepItemSchema, SPACE_TYPES } from "@architech/core";
import { z } from "zod";

export const analysisInput = z.object({
  summary: z.string().max(400).default(""),
  suggestions: z.array(z.object({ label: z.string().max(40), prompt: z.string().max(400) })).max(12).default([]),
});

export const titleInput = z.string().trim().min(1).max(60);

export const createProjectInput = z.object({
  photoKey: z.string().min(1),
  title: titleInput,
  spaceType: z.enum(SPACE_TYPES),
  analysis: analysisInput.default({ summary: "", suggestions: [] }),
  keep: z.array(keepItemSchema).max(40).default([]),
  calibration: calibrationSchema.nullable().default(null),
});

export const patchProjectInput = z
  .object({
    title: titleInput.optional(),
    spaceType: z.enum(SPACE_TYPES).optional(),
    keep: z.array(keepItemSchema).max(40).optional(),
    calibration: calibrationSchema.nullable().optional(),
    coverVersionId: z.string().uuid().optional(),
    planning: planningSchema.nullable().optional(),
    expectedPlanningRevision: z.number().int().nonnegative().optional(),
  })
  .strict();

const historyInput = z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(2000) })).max(20).default([]);

export const createEditInput = z.union([
  z.object({
    projectId: z.string().uuid(),
    baseVersionId: z.string().uuid().optional(),
    request: editRequestSchema,
  }),
  z.object({
    projectId: z.null().optional(),
    baseKey: z.string().min(1),
    spaceType: z.enum(SPACE_TYPES),
    calibration: calibrationSchema.nullable().default(null),
    history: historyInput,
    request: editRequestSchema,
  }),
]);

/** A device project being moved to the server. Images are sent alongside as v0, v1, ... */
export const importBundleInput = z.object({
  planning: planningSchema.nullable().optional(),
  title: titleInput,
  spaceType: z.enum(SPACE_TYPES),
  analysis: analysisInput.default({ summary: "", suggestions: [] }),
  keep: z.array(keepItemSchema).max(40).default([]),
  calibration: calibrationSchema.nullable().default(null),
  versions: z
    .array(
      z.object({
        label: z.string().max(60),
        request: editRequestSchema.nullable().default(null),
        prompt: z.string().max(20_000).nullable().default(null),
        verified: z.boolean().default(true),
        problems: z.array(z.string().max(300)).max(10).default([]),
      }),
    )
    .min(1)
    .max(60),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(4000),
        followUps: z.array(z.string().max(60)).max(5).default([]),
        versionIndex: z.number().int().min(0).nullable().default(null),
      }),
    )
    .max(400)
    .default([]),
  coverIndex: z.number().int().min(0).default(0),
});
export type ImportBundle = z.infer<typeof importBundleInput>;
