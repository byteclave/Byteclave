import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, open, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { desc, eq, sql } from "drizzle-orm";
import {
  mediaAssignmentSchema,
  mediaUploadRequestSchema,
} from "@workspace/domain/schemas";
import { getDb } from "../index";
import { auditLogs, discoveries, entityContentVersions, media } from "../schema";
import { recordContentAudit } from "./content-management";

const MEDIA_MAX_BYTES = 10 * 1024 * 1024;
const MEDIA_KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(png|jpg|webp|pdf)$/u;
const extensionByType = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "application/pdf": "pdf",
} as const;

export class MediaNotFoundError extends Error {
  constructor(message = "The media asset was not found.") {
    super(message);
    this.name = "MediaNotFoundError";
  }
}

export class MediaConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MediaConflictError";
  }
}

export class InvalidMediaFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidMediaFileError";
  }
}

export type MediaAssetView = {
  id: string;
  discoveryId: string | null;
  storageKey: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  altText: string | null;
  createdByUserId: string | null;
  createdAt: string;
  mediaUrl: string;
};

export function getMediaStorageDirectory(): string {
  return path.resolve(process.env.MEDIA_STORAGE_DIR || "data/media");
}

export function getSafeMediaPath(storageKey: string): string {
  if (!MEDIA_KEY_PATTERN.test(storageKey)) {
    throw new MediaNotFoundError();
  }
  const root = getMediaStorageDirectory();
  const filePath = path.resolve(root, storageKey);
  if (path.dirname(filePath) !== root) {
    throw new MediaNotFoundError();
  }
  return filePath;
}

export function validateMediaPayload(
  metadata: unknown,
  bytes: Buffer,
): { fileName: string; contentType: keyof typeof extensionByType; sizeBytes: number } {
  const parsed = mediaUploadRequestSchema.safeParse(metadata);
  if (!parsed.success) {
    throw new InvalidMediaFileError(
      parsed.error.issues.map((issue) => issue.message).join(" "),
    );
  }
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > MEDIA_MAX_BYTES) {
    throw new InvalidMediaFileError("The file must be between 1 byte and 10 MB.");
  }
  if (bytes.length !== parsed.data.sizeBytes) {
    throw new InvalidMediaFileError("The uploaded file size did not match its metadata.");
  }
  if (!hasExpectedSignature(bytes, parsed.data.contentType)) {
    throw new InvalidMediaFileError("The file contents do not match the selected file type.");
  }
  return parsed.data;
}

function hasExpectedSignature(
  bytes: Buffer,
  contentType: keyof typeof extensionByType,
): boolean {
  if (contentType === "image/png") {
    return bytes.length >= 8 && bytes.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
  }
  if (contentType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (contentType === "image/webp") {
    return bytes.length >= 12 &&
      bytes.toString("ascii", 0, 4) === "RIFF" &&
      bytes.toString("ascii", 8, 12) === "WEBP";
  }
  return bytes.length >= 5 && bytes.toString("ascii", 0, 5) === "%PDF-";
}

function toMediaView(asset: typeof media.$inferSelect): MediaAssetView {
  return {
    id: asset.id,
    discoveryId: asset.discoveryId,
    storageKey: asset.storageKey,
    fileName: asset.fileName,
    contentType: asset.contentType,
    sizeBytes: asset.sizeBytes,
    altText: asset.altText,
    createdByUserId: asset.createdByUserId,
    createdAt: asset.createdAt.toISOString(),
    mediaUrl: `/api/media/${encodeURIComponent(asset.storageKey)}`,
  };
}

export async function listManagedMedia(): Promise<MediaAssetView[]> {
  const rows = await getDb()
    .select()
    .from(media)
    .orderBy(desc(media.createdAt));
  return rows.map(toMediaView);
}

export async function uploadManagedMedia(
  metadata: unknown,
  bytes: Buffer,
  actorUserId: string,
  rawAltText: unknown,
): Promise<MediaAssetView> {
  const file = validateMediaPayload(metadata, bytes);
  if (
    rawAltText !== null &&
    rawAltText !== undefined &&
    typeof rawAltText !== "string"
  ) {
    throw new InvalidMediaFileError("Alternative text must be plain text.");
  }
  if (typeof rawAltText === "string" && rawAltText.length > 500) {
    throw new InvalidMediaFileError("Alternative text must be 500 characters or fewer.");
  }
  const altText =
    typeof rawAltText === "string" && rawAltText.trim()
      ? rawAltText.trim()
      : null;
  const storageKey = `${randomUUID()}.${extensionByType[file.contentType]}`;
  const filePath = getSafeMediaPath(storageKey);
  await mkdir(getMediaStorageDirectory(), { recursive: true, mode: 0o700 });
  const fileHandle = await open(filePath, "wx", 0o600);
  try {
    await fileHandle.writeFile(bytes);
  } catch (error) {
    await rm(filePath, { force: true });
    throw error;
  } finally {
    await fileHandle.close();
  }

  try {
    const asset = await getDb().transaction(async (tx) => {
      const [created] = await tx
        .insert(media)
        .values({
          storageKey,
          fileName: file.fileName,
          contentType: file.contentType,
          sizeBytes: file.sizeBytes,
          altText,
          createdByUserId: actorUserId,
        })
        .returning();
      if (!created) throw new Error("The media asset could not be saved.");
      await tx.insert(auditLogs).values({
        actorUserId,
        entityType: "media",
        entityId: created.id,
        action: "media.uploaded",
        changes: {
          after: {
            fileName: created.fileName,
            contentType: created.contentType,
            sizeBytes: created.sizeBytes,
            altText: created.altText,
          },
        },
      });
      return created;
    });
    return toMediaView(asset);
  } catch (error) {
    await rm(filePath, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function updateManagedMedia(
  mediaId: string,
  rawInput: unknown,
  actorUserId: string,
): Promise<MediaAssetView> {
  const input = mediaAssignmentSchema.parse(rawInput);
  return getDb().transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(media)
      .where(eq(media.id, mediaId))
      .for("update")
      .limit(1);
    if (!current) throw new MediaNotFoundError();

    if (input.discoveryId) {
      const [discovery] = await tx
        .select({ id: discoveries.id })
        .from(discoveries)
        .where(eq(discoveries.id, input.discoveryId))
        .limit(1);
      if (!discovery) throw new MediaNotFoundError("The selected discovery was not found.");
    }

    const altText = input.altText?.trim() || null;
    const changed =
      current.discoveryId !== input.discoveryId || current.altText !== altText;
    if (!changed) return toMediaView(current);

    const [updated] = await tx
      .update(media)
      .set({
        discoveryId: input.discoveryId,
        altText,
        updatedAt: new Date(),
      })
      .where(eq(media.id, mediaId))
      .returning();
    if (!updated) throw new MediaNotFoundError();

    for (const discoveryId of new Set(
      [current.discoveryId, updated.discoveryId].filter(
        (id): id is string => Boolean(id),
      ),
    )) {
      await recordContentAudit(tx, {
        actorUserId,
        entityType: "discovery",
        entityId: discoveryId,
        action: "content.discovery.updated",
        changes: { media: { changed: mediaId } },
      });
    }

    await tx.insert(auditLogs).values({
      actorUserId,
      entityType: "media",
      entityId: mediaId,
      action: "media.updated",
      changes: {
        before: {
          discoveryId: current.discoveryId,
          altText: current.altText,
        },
        after: {
          discoveryId: updated.discoveryId,
          altText: updated.altText,
        },
      },
    });
    return toMediaView(updated);
  });
}

export async function deleteManagedMedia(
  mediaId: string,
  actorUserId: string,
): Promise<void> {
  const movedFile: { current: { original: string; tombstone: string } | null } = {
    current: null,
  };
  try {
    await getDb().transaction(async (tx) => {
      const [asset] = await tx
        .select()
        .from(media)
        .where(eq(media.id, mediaId))
        .for("update")
        .limit(1);
      if (!asset) throw new MediaNotFoundError();
      if (asset.discoveryId) {
        throw new MediaConflictError(
          "This asset is attached to content. Unlink it before deleting.",
        );
      }
      const [historicalReference] = await tx
        .select({ id: entityContentVersions.id })
        .from(entityContentVersions)
        .where(
          sql`${entityContentVersions.snapshot} @> ${JSON.stringify({
            media: [{ id: asset.id }],
          })}::jsonb`,
        )
        .limit(1);
      if (historicalReference) {
        throw new MediaConflictError(
          "This asset is preserved in content history. Keep it so older versions can be restored safely.",
        );
      }

      const original = getSafeMediaPath(asset.storageKey);
      const tombstone = path.join(
        getMediaStorageDirectory(),
        `.deleting-${randomUUID()}`,
      );
      try {
        await rename(original, tombstone);
        movedFile.current = { original, tombstone };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          throw new MediaNotFoundError("The stored file is missing; the asset was not deleted.");
        }
        throw error;
      }

      await tx.delete(media).where(eq(media.id, asset.id));
      await tx.insert(auditLogs).values({
        actorUserId,
        entityType: "media",
        entityId: asset.id,
        action: "media.deleted",
        changes: {
          before: {
            fileName: asset.fileName,
            contentType: asset.contentType,
            sizeBytes: asset.sizeBytes,
            altText: asset.altText,
          },
        },
      });
    });
  } catch (error) {
    if (movedFile.current) {
      await rename(movedFile.current.tombstone, movedFile.current.original).catch(() => undefined);
    }
    throw error;
  }
  if (movedFile.current) await rm(movedFile.current.tombstone, { force: true });
}

export async function getMediaForDelivery(storageKey: string) {
  const safePath = getSafeMediaPath(storageKey);
  const [asset] = await getDb()
    .select({
      id: media.id,
      storageKey: media.storageKey,
      fileName: media.fileName,
      contentType: media.contentType,
      sizeBytes: media.sizeBytes,
      discoveryId: media.discoveryId,
    })
    .from(media)
    .where(eq(media.storageKey, storageKey))
    .limit(1);
  if (!asset) throw new MediaNotFoundError();
  let publicDiscovery = false;
  if (asset.discoveryId) {
    const [discovery] = await getDb()
      .select({ status: discoveries.status })
      .from(discoveries)
      .where(eq(discoveries.id, asset.discoveryId))
      .limit(1);
    publicDiscovery = discovery?.status === "published";
  }
  try {
    await stat(safePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new MediaNotFoundError("The stored file is missing.");
    }
    throw error;
  }
  return {
    ...asset,
    publicDiscovery,
    stream: createReadStream(safePath),
  };
}

