"use strict";

const express = require("express");
const multer = require("multer");
const { pipeline } = require("node:stream/promises");
const { createCampaignAuthorGuard } = require("../middleware/campaignAuthorAuthentication");
const { apiErrorResponse } = require("../utils/apiErrorResponse");
const { createCampaignImageService, MAX_IMAGE_BYTES } = require("../services/campaignImages");

function safeImageError(res, error) {
  if (error?.status === 503 && error.code === "IMAGE_STORAGE_FULL") {
    return apiErrorResponse(res, 503, "IMAGE_STORAGE_FULL", "Photo storage is temporarily unavailable. Please try again later", null);
  }
  const known = Number.isInteger(error?.status) && error.status >= 400 && error.status < 500 && error.code;
  // Do not log exception objects: they can contain paths, SQL data or signed URLs.
  return apiErrorResponse(res, known ? error.status : 500, known ? error.code : "INTERNAL_SERVER_ERROR", known ? error.message : "The photo could not be processed", known ? error.fieldErrors ?? null : null);
}

function createCampaignImageRouter(models, options = {}) {
  const router = express.Router();
  const service = options.service || createCampaignImageService(models, options);
  const parse = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 0, parts: 1, fieldNameSize: 20, fieldNestingDepth: 0, fieldArrayIndexLimit: 0 } }).single("file");
  let activeUploads = 0;
  router.post("/", createCampaignAuthorGuard(models), (req, res) => {
    if (activeUploads >= 2) return apiErrorResponse(res, 503, "UPLOAD_BUSY", "Photo uploads are busy. Please try again shortly", null);
    activeUploads += 1;
    let released = false;
    let processing = false;
    const release = () => { if (!released) { released = true; activeUploads -= 1; } };
    res.once("close", () => { if (!processing) release(); });
    parse(req, res, async (error) => {
      processing = true;
      try {
        if (error) {
          return apiErrorResponse(res, error.code === "LIMIT_FILE_SIZE" ? 413 : 422, error.code === "LIMIT_FILE_SIZE" ? "IMAGE_TOO_LARGE" : "VALIDATION_FAILED", error.code === "LIMIT_FILE_SIZE" ? "Use a photo no larger than 5 MB" : "Send one photo in the file field and no other fields", { file: "Choose one JPEG, PNG or WebP photo" });
        }
        if (req.aborted) return;
        const result = await service.upload(req.file, req.user, req.token);
        res.set("Cache-Control", "no-store").status(201).json(result);
      } catch (uploadError) {
        if (!res.headersSent && !res.destroyed) safeImageError(res, uploadError);
      } finally { release(); }
    });
  });
  router.get("/:id/content", async (req, res) => {
    res.set({ "Cache-Control": "private, no-store, max-age=0", "Pragma": "no-cache", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "Cross-Origin-Resource-Policy": "same-origin" });
    let content;
    try {
      content = await service.content(req.params.id, req.query.ticket);
      res.set({ "Content-Type": content.contentType, "Content-Length": String(content.sizeBytes), "Content-Disposition": "inline" });
      await pipeline(content.file.createReadStream(), res);
    } catch (error) {
      if (content) await content.file.close().catch(() => {});
      if (!res.headersSent && !res.destroyed) safeImageError(res, error);
      else if (!res.destroyed) res.destroy();
    }
  });
  return router;
}

module.exports = { createCampaignImageRouter };
