"use strict";

const fs = require("node:fs/promises");
const { constants } = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { createHash } = require("node:crypto");
const { serviceError } = require("../utils/serviceError");

const STORAGE_KEY = /^[a-f0-9]{64}\.(?:jpg|png|webp)$/;
const writeQueues = new Map();
const storageBusy = () => serviceError(503, "IMAGE_STORAGE_FULL", "Photo storage is temporarily unavailable. Please try again later");

function configuredLimit(value, fallback) {
  if (value === undefined || value === "") return fallback;
  const limit = Number(value);
  if (!Number.isSafeInteger(limit) || limit < 0) throw new Error("Invalid image storage limit");
  return limit;
}

async function serializeWrite(directory, work) {
  const previous = writeQueues.get(directory) || Promise.resolve();
  const current = previous.catch(() => {}).then(work);
  writeQueues.set(directory, current);
  try { return await current; }
  finally { if (writeQueues.get(directory) === current) writeQueues.delete(directory); }
}

function defaultDirectory() {
  if (process.env.CAMPAIGN_UPLOAD_DIR) {
    if (!path.isAbsolute(process.env.CAMPAIGN_UPLOAD_DIR)) throw new Error("CAMPAIGN_UPLOAD_DIR must be absolute");
    return process.env.CAMPAIGN_UPLOAD_DIR;
  }
  if (process.env.NODE_ENV === "production") throw new Error("Configure a private persistent CAMPAIGN_UPLOAD_DIR in production");
  const checkout = createHash("sha256").update(path.resolve(__dirname, "../..")).digest("hex").slice(0, 16);
  return path.join(os.tmpdir(), `causeconnect-campaign-images-${checkout}`);
}

function createImageStorage(directory, options = {}) {
  const root = () => path.resolve(directory || defaultDirectory());
  async function prepare() {
    const dir = root();
    if (dir === path.parse(dir).root) throw new Error("A dedicated image directory is required");
    await fs.mkdir(dir, { recursive: true, mode: 0o700 });
    const stat = await fs.lstat(dir);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Image storage must be a private directory, not a symbolic link");
    return dir;
  }
  async function filename(key) {
    if (typeof key !== "string" || !STORAGE_KEY.test(key)) throw new Error("Invalid image storage key");
    return path.join(await prepare(), key);
  }
  return {
    async write(key, bytes) {
      const target = await filename(key);
      await serializeWrite(path.dirname(target), async () => {
        const maxBytes = configuredLimit(options.maxBytes ?? process.env.CAMPAIGN_UPLOAD_MAX_BYTES, 512 * 1024 * 1024);
        const minFreeBytes = configuredLimit(options.minFreeBytes ?? process.env.CAMPAIGN_UPLOAD_MIN_FREE_BYTES, 2 * 1024 * 1024 * 1024);
        let used = 0;
        let entries = 0;
        // The prototype uses one flat directory. Bound both memory and work even
        // if it contains many tiny photos; do not recursively scan the server.
        for await (const entry of await fs.opendir(root())) {
          entries += 1;
          if (entries > 10_000) throw storageBusy();
          if (entry.isFile()) {
            try { used += (await fs.lstat(path.join(root(), entry.name))).size; }
            catch (error) { if (error.code !== "ENOENT") throw error; }
          }
        }
        const freeBytes = options.availableBytes ? await options.availableBytes() : await fs.statfs(root()).then((stat) => stat.bavail * stat.bsize);
        if (used + bytes.length > maxBytes || freeBytes - bytes.length < minFreeBytes) throw storageBusy();
        const file = await fs.open(target, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
        let complete = false;
        try { await file.writeFile(bytes); complete = true; }
        finally {
          await file.close();
          if (!complete) await fs.unlink(target).catch(() => {});
        }
      });
    },
    async open(key) {
      const file = await fs.open(await filename(key), constants.O_RDONLY | constants.O_NOFOLLOW);
      const stat = await file.stat();
      if (!stat.isFile()) { await file.close(); throw new Error("Invalid image file"); }
      return { file, stat };
    },
    async remove(key) {
      try { await fs.unlink(await filename(key)); } catch (error) { if (error.code !== "ENOENT") throw error; }
    },
  };
}

module.exports = { createImageStorage, defaultDirectory, STORAGE_KEY };
