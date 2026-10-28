import { randomUUID } from "node:crypto";
import { OpenRouterError, RefusedError, runEdit } from "@architech/ai";
import { versionLabel, type SpaceType } from "@architech/core";
import { claimNextJob, completeJob, failJob, purgeDeviceJobs, requeueStaleJobs, setJobStage, type EditJob } from "@architech/db";
import { renderLook, thumbnail } from "@architech/imaging";
import { ai } from "./ai";
import { db } from "./db";
import { env } from "./env";
import { HttpError } from "./http";
import { deleteObjects, getObject, keys, ObjectNotFoundError, putObject, sweepTmp } from "./storage";

const HEARTBEAT_MS = 15_000;
const STALE_MS = 2 * 60_000;
const DEVICE_JOB_TTL_MS = 24 * 3600_000;
const TMP_TTL_MS = 48 * 3600_000;

export function friendlyError(e: unknown): string {
  if (e instanceof RefusedError) return e.message;
  if (e instanceof ObjectNotFoundError) return "We couldn't find the starting photo. Please try again.";
  if (e instanceof HttpError) return e.message;
  if (e instanceof OpenRouterError) {
    if (e.status === 401 || e.status === 403) return "The AI service key isn't working. Your edit was refunded.";
    if (e.status === 402) return "The AI service is out of funds. Your edit was refunded.";
    if (e.status === 429) return "The AI is very busy right now. Your edit was refunded, try again in a minute.";
  }
  return "The AI had trouble with that one. Your edit was refunded, please try again.";
}

/** Runs one claimed job to completion. Never throws. */
export async function processJob(job: EditJob): Promise<void> {
  const d = db();
  let stage = job.stage;
  const beat = setInterval(() => void setJobStage(d, job.id, stage).catch(() => {}), HEARTBEAT_MS);
  const written: string[] = [];
  try {
    const base = await getObject(job.baseKey);
    const samples: { drawingId: string; image: Buffer }[] = [];
    for (const d of job.request.drawings) {
      if (d.look?.source === "preset") {
        const image = await renderLook(d.itemType, d.look.presetId);
        if (image) samples.push({ drawingId: d.id, image });
      } else if (d.look?.source === "photo" && d.look.photoKey && keys.ownedBy(d.look.photoKey, job.userId)) {
        try {
          samples.push({ drawingId: d.id, image: await getObject(d.look.photoKey) });
        } catch (e) {
          if (!(e instanceof ObjectNotFoundError)) throw e;
        }
      }
    }
    const out = await runEdit(
      ai().deps(job.userId),
      { base, request: job.request, spaceType: job.spaceType as SpaceType, calibration: job.calibration, history: job.history, samples },
      (s) => {
        stage = s;
        void setJobStage(d, job.id, s).catch(() => {});
      },
    );
    const fileId = randomUUID();
    let resultKey: string;
    let thumbKey = "";
    if (job.projectId) {
      resultKey = keys.version(job.userId, job.projectId, fileId);
      thumbKey = keys.thumb(job.userId, job.projectId, fileId);
      await putObject(resultKey, out.image);
      written.push(resultKey);
      await putObject(thumbKey, await thumbnail(out.image));
      written.push(thumbKey);
    } else {
      resultKey = keys.tmp(job.userId, fileId);
      await putObject(resultKey, out.image);
      written.push(resultKey);
    }
    await completeJob(d, job.id, {
      resultKey,
      thumbKey,
      width: out.width,
      height: out.height,
      reply: out.reply,
      followUps: out.followUps,
      prompt: out.prompt,
      verified: out.verified,
      problems: out.problems,
      attempts: out.attempts,
      label: versionLabel(job.request),
    });
  } catch (e) {
    if (!(e instanceof RefusedError)) console.error(`[worker] job ${job.id} failed`, e);
    if (written.length) await deleteObjects(written).catch(() => {});
    await failJob(d, job.id, friendlyError(e)).catch((err) => console.error("[worker] could not mark job failed", err));
  } finally {
    clearInterval(beat);
  }
}

/** Claims and runs queued jobs until the queue is empty. Returns how many ran. */
export async function drainQueue(): Promise<number> {
  let n = 0;
  for (;;) {
    const job = await claimNextJob(db());
    if (!job) return n;
    await processJob(job);
    n++;
  }
}

export async function maintenance() {
  const d = db();
  await requeueStaleJobs(d, STALE_MS);
  const purged = await purgeDeviceJobs(d, DEVICE_JOB_TTL_MS);
  const tmpKeys = purged.flatMap((p) => [p.baseKey, p.resultKey ?? ""]).filter((k) => k.startsWith(keys.tmpPrefix));
  if (tmpKeys.length) await deleteObjects(tmpKeys);
  await sweepTmp(TMP_TTL_MS);
}

const g = globalThis as unknown as { __architechWorker?: { stop: () => void } };

export function startWorker() {
  if (g.__architechWorker) return g.__architechWorker;
  const concurrency = env().WORKER_CONCURRENCY;
  let running = 0;
  let stopped = false;
  let pumping = false;

  const pump = async () => {
    if (pumping || stopped) return;
    pumping = true;
    try {
      while (!stopped && running < concurrency) {
        const job = await claimNextJob(db());
        if (!job) break;
        running++;
        void processJob(job).finally(() => {
          running--;
          void pump();
        });
      }
    } catch (e) {
      console.error("[worker] queue error", e);
    } finally {
      pumping = false;
    }
  };

  const poll = setInterval(() => void pump(), 1000);
  const maint = setInterval(() => void maintenance().catch((e) => console.error("[worker] maintenance", e)), 5 * 60_000);
  void maintenance().catch((e) => console.error("[worker] maintenance", e));
  poll.unref?.();
  maint.unref?.();
  console.log(`[worker] started (${concurrency} at a time)`);
  g.__architechWorker = {
    stop: () => {
      stopped = true;
      clearInterval(poll);
      clearInterval(maint);
      g.__architechWorker = undefined;
    },
  };
  return g.__architechWorker;
}
