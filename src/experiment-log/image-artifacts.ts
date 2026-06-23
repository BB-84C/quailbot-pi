import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

import type { ExperimentLogIdentity } from "./experiment-log-service.js";

export type ExperimentLogImageArtifact = {
  type: "image";
  source_path: string;
  blob_path: string;
  blob_relative_path: string;
  sha256: string;
  bytes: number;
  mime_type: string;
};

export function persistImageArtifactsInValue(
  identity: ExperimentLogIdentity,
  value: unknown,
  warn?: (message: string) => void,
): ExperimentLogImageArtifact[] {
  const artifacts: ExperimentLogImageArtifact[] = [];
  const seenObjects = new WeakSet<object>();
  const seenArtifacts = new Set<string>();

  const addArtifact = (artifact: ExperimentLogImageArtifact): void => {
    const key = artifact.sha256 || artifact.blob_path;
    if (seenArtifacts.has(key)) {
      return;
    }
    seenArtifacts.add(key);
    artifacts.push(artifact);
  };

  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      if (seenObjects.has(node)) {
        return;
      }
      seenObjects.add(node);
      for (const item of node) {
        visit(item);
      }
      return;
    }

    if (!isRecord(node)) {
      return;
    }
    if (seenObjects.has(node)) {
      return;
    }
    seenObjects.add(node);

    const existingArtifact = imageArtifact(node.experiment_log_artifact);
    if (existingArtifact !== undefined) {
      addArtifact(existingArtifact);
    } else {
      const persisted = persistImageRecord(identity, node, warn);
      if (persisted !== undefined) {
        addArtifact(persisted);
      }
    }

    for (const item of Object.values(node)) {
      visit(item);
    }
  };

  visit(value);
  return artifacts;
}

function persistImageRecord(
  identity: ExperimentLogIdentity,
  record: Record<string, unknown>,
  warn?: (message: string) => void,
): ExperimentLogImageArtifact | undefined {
  if (record.ok !== true) {
    return undefined;
  }

  const imagePath = stringValue(record.image_path);
  const mimeType = stringValue(record.mime_type);
  if (imagePath === undefined || mimeType === undefined || !mimeType.startsWith("image/")) {
    return undefined;
  }

  try {
    const bytes = readFileSync(imagePath);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const blobsImagesDir = join(identity.blobs_path, "images");
    const sourceResolved = resolve(imagePath);
    const blobsImagesResolved = resolve(blobsImagesDir);
    // If the source file is already inside this experiment's blobs/images
    // directory (the normal ROI-capture path), use it in place without
    // making a sha256-named copy. The artifact's blob_relative_path uses
    // the file's actual human-readable basename so events.jsonl points at
    // the same on-disk file that the producer wrote.
    const alreadyInBlobs = dirname(sourceResolved) === blobsImagesResolved;
    let blobPath: string;
    if (alreadyInBlobs) {
      blobPath = sourceResolved;
    } else {
      const filename = basename(imagePath) || `image-${sha256}${extensionForMimeType(mimeType)}`;
      blobPath = join(blobsImagesDir, filename);
      mkdirSync(blobsImagesDir, { recursive: true });
      if (!existsSync(blobPath)) {
        copyFileSync(imagePath, blobPath);
      }
    }
    const blobRelativePath = `blobs/images/${basename(blobPath)}`;

    const artifact: ExperimentLogImageArtifact = {
      type: "image",
      source_path: imagePath,
      blob_path: blobPath,
      blob_relative_path: blobRelativePath,
      sha256,
      bytes: statSync(blobPath).size,
      mime_type: mimeType,
    };
    record.experiment_log_artifact = artifact;
    return artifact;
  } catch (error) {
    warn?.(`experiment log image artifact failed for ${imagePath}: ${errorMessage(error)}`);
    return undefined;
  }
}

function imageArtifact(value: unknown): ExperimentLogImageArtifact | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const type = value.type;
  const sourcePath = stringValue(value.source_path);
  const blobPath = stringValue(value.blob_path);
  const blobRelativePath = stringValue(value.blob_relative_path);
  const sha256 = stringValue(value.sha256);
  const bytes = typeof value.bytes === "number" && Number.isFinite(value.bytes) ? value.bytes : undefined;
  const mimeType = stringValue(value.mime_type);
  if (
    type !== "image" ||
    sourcePath === undefined ||
    blobPath === undefined ||
    blobRelativePath === undefined ||
    sha256 === undefined ||
    bytes === undefined ||
    mimeType === undefined
  ) {
    return undefined;
  }

  return {
    type: "image",
    source_path: sourcePath,
    blob_path: blobPath,
    blob_relative_path: blobRelativePath,
    sha256,
    bytes,
    mime_type: mimeType,
  };
}

function extensionForMimeType(mimeType: string): string {
  if (mimeType === "image/jpeg") {
    return ".jpg";
  }
  if (mimeType === "image/webp") {
    return ".webp";
  }
  if (mimeType === "image/gif") {
    return ".gif";
  }
  return ".png";
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
