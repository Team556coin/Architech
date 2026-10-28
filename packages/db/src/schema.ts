import type { Planning, Calibration, EditRequest, KeepItem } from "@architech/core";
import { sql } from "drizzle-orm";
import { bigserial, boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

// ---- Auth (better-auth core tables) ----

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

// ---- App ----

export const profiles = pgTable("profiles", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  credits: integer("credits").notNull(),
  units: text("units").$type<"imperial" | "metric">().notNull().default("imperial"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export interface ProjectAnalysis {
  summary: string;
  suggestions: { label: string; prompt: string }[];
}

/** Projects stored on the server (max 5 per user). Projects beyond that live on the device. */
export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    spaceType: text("space_type").notNull(),
    analysis: jsonb("analysis").$type<ProjectAnalysis>().notNull().default(sql`'{"summary":"","suggestions":[]}'::jsonb`),
    keep: jsonb("keep").$type<KeepItem[]>().notNull().default(sql`'[]'::jsonb`),
    calibration: jsonb("calibration").$type<Calibration | null>(),
  planning: jsonb("planning").$type<Planning | null>(),
    coverVersionId: uuid("cover_version_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("projects_user_idx").on(t.userId)],
);

export const versions = pgTable(
  "versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id"),
    number: integer("number").notNull(),
    label: text("label").notNull(),
    imageKey: text("image_key").notNull(),
    thumbKey: text("thumb_key").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    request: jsonb("request").$type<EditRequest | null>(),
    prompt: text("prompt"),
    verified: boolean("verified").notNull().default(true),
    problems: jsonb("problems").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("versions_project_idx").on(t.projectId)],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seq: bigserial("seq", { mode: "number" }).notNull(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    role: text("role").$type<"user" | "assistant">().notNull(),
    content: text("content").notNull(),
    versionId: uuid("version_id"),
    followUps: jsonb("follow_ups").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("messages_project_idx").on(t.projectId)],
);

export const creditLedger = pgTable(
  "credit_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    delta: integer("delta").notNull(),
    reason: text("reason").notNull(),
    jobId: uuid("job_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("credit_ledger_user_idx").on(t.userId)],
);

export type JobStatus = "queued" | "running" | "succeeded" | "failed";

export const editJobs = pgTable(
  "edit_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Server project, or null when the project lives on the device. */
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    baseVersionId: uuid("base_version_id"),
    baseKey: text("base_key").notNull(),
    spaceType: text("space_type").notNull(),
    request: jsonb("request").$type<EditRequest>().notNull(),
    calibration: jsonb("calibration").$type<Calibration | null>(),

    history: jsonb("history").$type<{ role: "user" | "assistant"; content: string }[]>().notNull().default(sql`'[]'::jsonb`),
    status: text("status").$type<JobStatus>().notNull().default("queued"),
    stage: text("stage").notNull().default("queued"),
    free: boolean("free").notNull().default(false),
    charged: boolean("charged").notNull().default(false),
    attempts: integer("attempts").notNull().default(0),
    resultKey: text("result_key"),
    resultWidth: integer("result_width"),
    resultHeight: integer("result_height"),
    reply: text("reply"),
    followUps: jsonb("follow_ups").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    verified: boolean("verified"),
    problems: jsonb("problems").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    error: text("error"),
    versionId: uuid("version_id"),
    /** Set on the one free "Something's wrong" retry of a finished job. */
    retryOfJobId: uuid("retry_of_job_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    index("edit_jobs_user_idx").on(t.userId, t.createdAt),
    index("edit_jobs_status_idx").on(t.status, t.createdAt),
    uniqueIndex("edit_jobs_retry_of_idx").on(t.retryOfJobId),
  ],
);

export type Project = typeof projects.$inferSelect;
export type Version = typeof versions.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type EditJob = typeof editJobs.$inferSelect;
