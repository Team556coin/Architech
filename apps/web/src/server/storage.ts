import {
  CopyObjectCommand,
  CreateBucketCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { env, s3Endpoint } from "./env";

const g = globalThis as unknown as { __architechS3?: S3Client };

function client(): S3Client {
  if (!g.__architechS3) {
    const e = env();
    g.__architechS3 = new S3Client({
      region: e.S3_REGION,
      endpoint: s3Endpoint(e),
      forcePathStyle: true,
      credentials: { accessKeyId: e.S3_ACCESS_KEY_ID, secretAccessKey: e.S3_SECRET_ACCESS_KEY },
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }
  return g.__architechS3;
}

const bucket = () => env().S3_BUCKET;

export async function putObject(key: string, body: Buffer, contentType = "image/jpeg") {
  await client().send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType }));
}

export class ObjectNotFoundError extends Error {}

export async function getObject(key: string): Promise<Buffer> {
  try {
    const res = await client().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
    const bytes = await res.Body!.transformToByteArray();
    return Buffer.from(bytes);
  } catch (e) {
    const name = (e as { name?: string }).name;
    if (name === "NoSuchKey" || name === "NotFound") throw new ObjectNotFoundError(key);
    throw e;
  }
}

export async function copyObject(from: string, to: string) {
  await client().send(new CopyObjectCommand({ Bucket: bucket(), CopySource: `${bucket()}/${encodeURIComponent(from).replace(/%2F/g, "/")}`, Key: to }));
}

export async function deleteObjects(keys: string[]) {
  const unique = [...new Set(keys.filter(Boolean))];
  for (let i = 0; i < unique.length; i += 900) {
    const chunk = unique.slice(i, i + 900);
    await client().send(new DeleteObjectsCommand({ Bucket: bucket(), Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true } }));
  }
}

export async function deletePrefix(prefix: string) {
  let token: string | undefined;
  do {
    const res = await client().send(new ListObjectsV2Command({ Bucket: bucket(), Prefix: prefix, ContinuationToken: token }));
    const keys = (res.Contents ?? []).map((o) => o.Key!).filter(Boolean);
    if (keys.length) await deleteObjects(keys);
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
}

export async function ensureBucket() {
  try {
    await client().send(new HeadBucketCommand({ Bucket: bucket() }));
  } catch {
    if (env().S3_CREATE_BUCKET === "true") await client().send(new CreateBucketCommand({ Bucket: bucket() }));
    else throw new Error(`Storage bucket "${bucket()}" is not reachable. Check your R2 settings.`);
  }
}

export const keys = {
  version: (userId: string, projectId: string, versionId: string) => `u/${userId}/p/${projectId}/${versionId}.jpg`,
  thumb: (userId: string, projectId: string, versionId: string) => `u/${userId}/p/${projectId}/${versionId}-thumb.jpg`,
  project: (userId: string, projectId: string) => `u/${userId}/p/${projectId}/`,
  /** Short-lived files for photos and edits of projects that live on the device. */
  tmp: (userId: string, id: string) => `tmp/${userId}/${id}.jpg`,
  tmpPrefix: "tmp/",
  ownedBy: (key: string, userId: string) =>
    (key.startsWith(`u/${userId}/`) || key.startsWith(`tmp/${userId}/`)) && !key.includes("..") && !key.includes("\\"),
};

/** Deletes temporary files older than the cutoff. */
export async function sweepTmp(olderThanMs: number): Promise<number> {
  const cutoff = Date.now() - olderThanMs;
  let token: string | undefined;
  let removed = 0;
  do {
    const res = await client().send(new ListObjectsV2Command({ Bucket: bucket(), Prefix: keys.tmpPrefix, ContinuationToken: token }));
    const old = (res.Contents ?? []).filter((o) => o.Key && o.LastModified && o.LastModified.getTime() < cutoff).map((o) => o.Key!);
    if (old.length) await deleteObjects(old);
    removed += old.length;
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return removed;
}

export const fileUrl = (key: string) => `/api/files/${key}`;
