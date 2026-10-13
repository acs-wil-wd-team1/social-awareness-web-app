"use strict";

const { createHash, createHmac, randomBytes, timingSafeEqual } = require("node:crypto");
const path = require("node:path");
const sharp = require("sharp");
const jwt = require("jsonwebtoken");
const { Op } = require("sequelize");
const { createImageStorage } = require("./campaignImageStorage");
const { serviceError, validationError } = require("../utils/serviceError");

const MAX_IMAGE_BYTES = 5_000_000;
const MAX_IMAGE_PIXELS = 16_000_000;
const UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;
const PRIVATE_TTL_SECONDS = 300;
const IMAGE_ID = /^img_[a-f0-9]{48}$/;
const formats = { jpeg: { mime: "image/jpeg", extensions: [".jpg", ".jpeg"], extension: "jpg" }, png: { mime: "image/png", extensions: [".png"], extension: "png" }, webp: { mime: "image/webp", extensions: [".webp"], extension: "webp" } };

const missingImage = () => serviceError(404, "IMAGE_NOT_FOUND", "Image not found");
const invalidImage = () => validationError({ imageId: "Choose a valid, unused photo uploaded by your account" });
const fingerprint = (token) => createHash("sha256").update(token).digest("base64url");
const validId = (id) => Number.isSafeInteger(id) && id > 0 && id <= 2147483647;

async function decodeImage(file) {
  if (!file || !Buffer.isBuffer(file.buffer) || !file.buffer.length) throw validationError({ file: "Choose one campaign photo" });
  if (file.buffer.length > MAX_IMAGE_BYTES) throw serviceError(413, "IMAGE_TOO_LARGE", "Use a photo no larger than 5 MB");
  const extension = path.extname(String(file.originalname || "")).toLowerCase();
  const declaredFormat = Object.keys(formats).find((format) => formats[format].mime === file.mimetype && formats[format].extensions.includes(extension));
  if (!declaredFormat) throw serviceError(415, "UNSUPPORTED_IMAGE_TYPE", "Use a JPEG, PNG or WebP photo with a matching filename and content type");
  try {
    const inputOptions = { failOn: "warning", limitInputPixels: MAX_IMAGE_PIXELS, animated: false };
    const metadata = await sharp(file.buffer, inputOptions).metadata();
    if (metadata.format !== declaredFormat || !metadata.width || !metadata.height || (metadata.pages || 1) !== 1) throw new Error("Invalid decoded image");
    // Decode and re-encode, stripping metadata and untrusted trailing content.
    const bytes = await sharp(file.buffer, inputOptions).rotate().toFormat(declaredFormat).toBuffer();
    if (bytes.length > MAX_IMAGE_BYTES) throw serviceError(413, "IMAGE_TOO_LARGE", "The decoded photo exceeds 5 MB; choose a smaller photo");
    return { bytes, contentType: formats[declaredFormat].mime, extension: formats[declaredFormat].extension };
  } catch (error) {
    if (error.status === 413) throw error;
    throw validationError({ file: "The photo could not be decoded. Use a non-animated JPEG, PNG or WebP up to 16 megapixels" });
  }
}

function signTicket(payload, secret) {
  if (!secret) throw new Error("Image ticket signing is not configured");
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const key = createHmac("sha256", secret).update("causeconnect:campaign-image-ticket:key:v1").digest();
  const signature = createHmac("sha256", key).update(`image-content:v1:${encoded}`).digest("base64url");
  return `${encoded}.${signature}`;
}

function readTicket(ticket, { imageId, campaignId, nowSeconds, secret }) {
  if (typeof ticket !== "string" || ticket.length > 1000 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(ticket)) throw missingImage();
  const [encoded, signature] = ticket.split(".");
  let payload;
  try { payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")); } catch { throw missingImage(); }
  if (!payload || payload.v !== 1 || payload.i !== imageId || payload.c !== campaignId || !validId(payload.u) || !validId(payload.s)
    || !Number.isSafeInteger(payload.e) || payload.e <= nowSeconds || payload.e > nowSeconds + PRIVATE_TTL_SECONDS
    || typeof payload.f !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(payload.f)
    || Object.keys(payload).sort().join(",") !== "c,e,f,i,s,u,v") throw missingImage();
  const expected = signTicket(payload, secret).split(".")[1];
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw missingImage();
  return payload;
}

function createCampaignImageService(models, { storage = createImageStorage(), now = () => new Date(), secret = () => process.env.JWT_SECRET } = {}) {
  const { sequelize, CampaignImage, Campaign, User, UserSession } = models;
  async function authorInTransaction(user, token, transaction) {
    const account = validId(user?.id) && await User.findByPk(user.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!account || account.status !== "active" || !["public", "business_owner"].includes(account.role)) throw serviceError(403, "FORBIDDEN", "Only active campaign authors can upload photos");
    let claims;
    try { claims = jwt.verify(token, secret(), { algorithms: ["HS256"] }); } catch { throw serviceError(401, "INVALID_TOKEN", "Your session is invalid or has expired"); }
    if (claims.id !== user.id) throw serviceError(401, "INVALID_TOKEN", "Your session is invalid or has expired");
    const session = await UserSession.findOne({ where: { token, userId: user.id, status: "active" }, transaction, lock: transaction.LOCK.UPDATE, logging: false });
    if (!session) throw serviceError(401, "INVALID_TOKEN", "Session expired or logged out");
    return account;
  }
  async function sessionFor(currentUser, token, transaction) {
    if (!validId(currentUser?.id) || typeof token !== "string" || !secret()) throw missingImage();
    let claims;
    try { claims = jwt.verify(token, secret(), { algorithms: ["HS256"] }); } catch { throw missingImage(); }
    if (claims.id !== currentUser.id) throw missingImage();
    const session = await UserSession.findOne({ where: { token, userId: currentUser.id, status: "active" }, transaction, logging: false });
    const user = await User.findByPk(currentUser.id, { transaction });
    if (!session || !user || user.status !== "active") throw missingImage();
    return { session, user };
  }
  async function allowedPrivate(image, user) {
    return user.role === "admin" || (["public", "business_owner"].includes(user.role) && image.ownerId === user.userId);
  }

  const service = {
    async upload(file, user, token) {
      const decoded = await decodeImage(file);
      const imageId = `img_${randomBytes(24).toString("hex")}`;
      const storageKey = `${randomBytes(32).toString("hex")}.${decoded.extension}`;
      let written = false;
      try {
        const row = await sequelize.transaction(async (transaction) => {
          await authorInTransaction(user, token, transaction);
          const pendingCount = await CampaignImage.count({ where: { ownerId: user.id, campaignId: null, expiresAt: { [Op.gt]: now() } }, transaction });
          if (pendingCount >= 20) throw serviceError(429, "IMAGE_UPLOAD_LIMIT", "Use or wait for your previous uploads to expire before uploading more photos");
          await storage.write(storageKey, decoded.bytes);
          written = true;
          return CampaignImage.create({ imageId, ownerId: user.id, storageKey, contentType: decoded.contentType, sizeBytes: decoded.bytes.length, expiresAt: new Date(now().getTime() + UPLOAD_TTL_MS), campaignId: null }, { transaction });
        });
        return { imageId: row.imageId, contentType: row.contentType, sizeBytes: row.sizeBytes, expiresAt: row.expiresAt.toISOString() };
      } catch (error) {
        if (written) await storage.remove(storageKey);
        throw error;
      }
    },

    // Call only after locking the current account and campaign in this transaction.
    async attachImage(imageId, campaignId, ownerId, transaction) {
      if (!transaction) throw new Error("Image attachment requires a transaction");
      if (!validId(campaignId) || !validId(ownerId) || typeof imageId !== "string" || !IMAGE_ID.test(imageId)) throw invalidImage();
      const row = await CampaignImage.findByPk(imageId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!row || row.ownerId !== ownerId || row.campaignId != null || row.expiresAt.getTime() <= now().getTime()) throw invalidImage();
      const existing = await CampaignImage.findOne({ where: { campaignId }, transaction });
      if (existing) throw invalidImage();
      await row.update({ campaignId }, { transaction });
      return row;
    },

    async applyCampaignImageChange({ campaign, user, transaction, imageId, removeImage }) {
      if (!transaction) throw new Error("Image changes require a transaction");
      if (imageId === undefined && removeImage === undefined) return;
      if (user?.id !== campaign.createdBy) throw serviceError(403, "FORBIDDEN", "Only the campaign owner can change its photo");
      if ((imageId !== undefined && removeImage !== undefined) || (removeImage !== undefined && removeImage !== true)
        || (imageId !== undefined && (typeof imageId !== "string" || !IMAGE_ID.test(imageId)))) throw invalidImage();
      const rows = await CampaignImage.findAll({
        where: { [Op.or]: [{ campaignId: campaign.campaignId }, ...(imageId === undefined ? [] : [{ imageId }])] },
        order: [["imageId", "ASC"]], transaction, lock: transaction.LOCK.UPDATE,
      });
      const next = imageId === undefined ? null : rows.find((row) => row.imageId === imageId);
      if (imageId !== undefined && (!next || next.ownerId !== user.id || next.campaignId != null || next.expiresAt.getTime() <= now().getTime())) throw invalidImage();
      for (const current of rows.filter((row) => row.campaignId === campaign.campaignId)) {
        await current.update({ campaignId: null, expiresAt: now() }, { transaction });
      }
      if (next) await next.update({ campaignId: campaign.campaignId }, { transaction });
      campaign.imageUrl = null;
    },

    async buildImageUrl(campaignId, { audience = "public", currentUser, token, transaction } = {}) {
      const image = await CampaignImage.findOne({ where: { campaignId }, transaction });
      if (!image) return null;
      const campaign = await Campaign.findByPk(campaignId, { transaction });
      if (!campaign || campaign.deletedAt) return null;
      const base = `/api/campaign-images/${image.imageId}/content`;
      if (audience === "public") return campaign.status === "approved" ? base : null;
      const { session, user } = await sessionFor(currentUser, token, transaction);
      if (!await allowedPrivate(image, user)) throw missingImage();
      const ticket = signTicket({ v: 1, i: image.imageId, c: campaignId, u: user.userId, s: session.sessionId, e: Math.floor(now().getTime() / 1000) + PRIVATE_TTL_SECONDS, f: fingerprint(token) }, secret());
      return `${base}?ticket=${ticket}`;
    },

    async content(imageId, ticket) {
      if (typeof imageId !== "string" || !IMAGE_ID.test(imageId)) throw missingImage();
      const image = await CampaignImage.findByPk(imageId);
      if (!image || image.campaignId == null) throw missingImage();
      const campaign = await Campaign.findByPk(image.campaignId);
      if (!campaign || campaign.deletedAt) throw missingImage();
      if (ticket !== undefined || campaign.status !== "approved") {
        const payload = readTicket(ticket, { imageId, campaignId: image.campaignId, nowSeconds: Math.floor(now().getTime() / 1000), secret: secret() });
        const session = await UserSession.findByPk(payload.s, { logging: false });
        if (!session || session.userId !== payload.u || session.status !== "active" || fingerprint(session.token) !== payload.f) throw missingImage();
        const { user } = await sessionFor({ id: payload.u }, session.token);
        if (!await allowedPrivate(image, user)) throw missingImage();
      }
      let opened;
      try {
        opened = await storage.open(image.storageKey);
        if (opened.stat.size !== image.sizeBytes || !Object.values(formats).some(({ mime }) => mime === image.contentType)) throw new Error("Image file is not valid");
      } catch {
        if (opened) await opened.file.close();
        throw missingImage();
      }
      return { ...opened, contentType: image.contentType, sizeBytes: image.sizeBytes };
    },

    // Bounded cleanup: only expired, unattached records and their generated files.
    async pruneExpiredImages(limit = 100, { ownerId } = {}) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new Error("Invalid cleanup batch size");
      if (ownerId !== undefined && !validId(ownerId)) throw new Error("Invalid cleanup owner");
      return sequelize.transaction(async (transaction) => {
        const rows = await CampaignImage.findAll({ where: { campaignId: null, expiresAt: { [Op.lte]: now() }, ...(ownerId === undefined ? {} : { ownerId }) }, order: [["imageId", "ASC"]], limit, transaction, lock: transaction.LOCK.UPDATE });
        for (const row of rows) { await storage.remove(row.storageKey); await row.destroy({ transaction }); }
        return rows.length;
      });
    },
  };
  return service;
}

let defaultService;
function getCampaignImageService() {
  if (!defaultService) defaultService = createCampaignImageService(require("../database/models"));
  return defaultService;
}

module.exports = {
  createCampaignImageService, getCampaignImageService, decodeImage, signTicket, readTicket,
  MAX_IMAGE_BYTES, MAX_IMAGE_PIXELS, UPLOAD_TTL_MS, PRIVATE_TTL_SECONDS, IMAGE_ID,
  attachImage: (...args) => getCampaignImageService().attachImage(...args),
  applyCampaignImageChange: (...args) => getCampaignImageService().applyCampaignImageChange(...args),
  buildImageUrl: (...args) => getCampaignImageService().buildImageUrl(...args),
};
