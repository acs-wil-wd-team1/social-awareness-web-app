"use strict";

require("dotenv").config({ quiet: true });
if (process.env.RUN_DB_INTEGRATION !== "1" || process.env.NODE_ENV !== "test"
  || !/^[A-Za-z0-9_]+_test$/.test(process.env.DB_NAME_TEST || "")
  || process.env.DB_NAME_TEST === process.env.DB_NAME
  || !["localhost", "127.0.0.1", "::1"].includes(process.env.DB_HOST)
  || !process.env.JWT_SECRET) {
  throw new Error("Business acceptance regression requires a separate migrated local test database. Deployed/shared databases are refused.");
}

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomBytes } = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const bcrypt = require("bcrypt");
const { Op } = require("sequelize");
const db = require("../../src/database/models");
const app = require("../../src/app");
db.sequelize.options.logging = false;

test("business acceptance matches real profile, photo, moderation, enquiry and inbox APIs with retained MySQL records", async () => {
  await db.sequelize.authenticate();
  const { runBusinessAcceptance } = await import(pathToFileURL(path.resolve(__dirname, "../../../infra/ec2/acceptance-business.mjs")).href);
  const tag = `business-acceptance-${randomBytes(8).toString("hex")}`;
  const adminPassword = randomBytes(24).toString("base64url");
  const messages = [], privateValues = new Set([adminPassword]);
  const originalUploadDirectory = process.env.CAMPAIGN_UPLOAD_DIR;
  const commit = "a".repeat(40);
  let server, fixtures, admin, category, directory, now = Date.UTC(2026, 9, 14);
  try {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), "causeconnect-business-acceptance-"));
    process.env.CAMPAIGN_UPLOAD_DIR = directory;
    category = await db.Category.create({ categoryName: tag });
    admin = await db.User.create({ fullName: `${tag} admin`, email: `${tag}-admin@example.test`,
      passwordHash: await bcrypt.hash(adminPassword, 10), role: "admin", status: "active" });
    await new Promise(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    const result = await runBusinessAcceptance({
      origin, allowQaWrites: true, expectedCommit: commit, preferredCategoryId: category.categoryId,
      env: { CAUSECONNECT_QA_ADMIN_EMAIL: admin.email, CAUSECONNECT_QA_ADMIN_PASSWORD: adminPassword },
      // Only the EC2 manifest is a local hosting fixture. Every /api and image
      // request uses actual Express middleware, bcrypt, JWT, Sequelize/MySQL.
      fetchImpl: async (url, options) => {
        const target = new URL(url);
        assert.equal(target.origin, origin);
        if (target.pathname === "/release.json") {
          return new Response(JSON.stringify({ application: "CauseConnect", mode: "live", commit,
            releaseId: `fixture-${commit.slice(0, 12)}`, builtAt: "2026-10-14T00:00:00.000Z" }),
          { headers: { "Content-Type": "application/json" } });
        }
        assert.ok(target.pathname.startsWith("/api/"));
        if (["/api/auth/register", "/api/auth/login"].includes(target.pathname) && typeof options.body === "string") {
          const body = JSON.parse(options.body);
          if (typeof body.password === "string") privateValues.add(body.password);
        }
        const response = await fetch(url, options);
        if ((response.headers.get("content-type") || "").includes("application/json")) {
          const body = await response.clone().json();
          if (typeof body.token === "string") privateValues.add(body.token);
          const imageUrl = body.imageUrl ?? body.campaign?.imageUrl;
          if (typeof imageUrl === "string" && imageUrl.includes("ticket=")) privateValues.add(imageUrl);
        }
        return response;
      },
      clock: () => now, sleep: async milliseconds => { now += milliseconds; },
      emit: message => {
        messages.push(message);
        if (message.startsWith("QA business fixture receipt: ")) fixtures = JSON.parse(message.slice("QA business fixture receipt: ".length));
      },
    });
    fixtures = result.fixtures;
    assert.equal(result.checks, 8);
    assert.equal(fixtures.userIds.length, 3);
    assert.equal(fixtures.businessIds.length, 2);
    assert.equal(fixtures.campaignDeleted, true);
    assert.deepEqual(fixtures.uncertainWrites, []);
    const users = await db.User.findAll({ where: { userId: { [Op.in]: fixtures.userIds } }, order: [["userId", "ASC"]] });
    assert.deepEqual(users.map(user => user.role), ["business_owner", "public", "business_owner"]);
    assert.ok(users.every(user => user.email.startsWith(`qa-${fixtures.run}-`) && user.fullName.startsWith(`QA ${fixtures.run} `)));
    const profiles = await db.Business.findAll({ where: { businessId: { [Op.in]: fixtures.businessIds } }, order: [["businessId", "ASC"]] });
    assert.equal(profiles.length, 2);
    assert.deepEqual(profiles.map(profile => profile.ownerId), [fixtures.userIds[0], fixtures.userIds[2]]);
    assert.ok(profiles.every(profile => profile.businessName.startsWith(`QA ${fixtures.run} `) && profile.abn === null));
    const campaign = await db.Campaign.findByPk(fixtures.campaignId);
    assert.equal(campaign.createdBy, fixtures.userIds[0]);
    assert.equal(campaign.businessId, fixtures.businessIds[0]);
    assert.equal(campaign.categoryId, category.categoryId);
    assert.equal(campaign.status, "pending");
    assert.ok(campaign.deletedAt instanceof Date);
    assert.equal(campaign.deletedBy, fixtures.userIds[0]);
    const enquiry = await db.Lead.findByPk(fixtures.enquiryId);
    assert.equal(enquiry.campaignId, campaign.campaignId);
    assert.equal(enquiry.businessId, profiles[0].businessId);
    assert.equal(enquiry.userId, fixtures.userIds[1]);
    assert.equal(enquiry.phone, null);
    assert.ok(enquiry.name.startsWith(`QA ${fixtures.run} `));
    assert.equal(await db.Lead.count({ where: { businessId: profiles[1].businessId } }), 0);
    const image = await db.CampaignImage.findOne({ where: { campaignId: campaign.campaignId } });
    assert.ok(image && image.ownerId === fixtures.userIds[0]);
    assert.equal((await fs.stat(path.join(directory, image.storageKey))).size, image.sizeBytes);
    assert.equal(await db.CampaignReview.count({ where: { campaignId: campaign.campaignId, adminId: admin.userId, action: "approved" } }), 1);
    const audit = await db.ManagementAudit.findAll({ where: { targetType: "campaign", targetId: campaign.campaignId } });
    assert.equal(audit.length, 2);
    assert.deepEqual(new Set(audit.map(row => row.action)), new Set(["campaign_unpublished", "campaign_deleted"]));
    const allIds = [...fixtures.userIds, admin.userId];
    assert.equal(await db.UserSession.count({ where: { userId: { [Op.in]: allIds } } }), 4);
    assert.equal(await db.UserSession.count({ where: { userId: { [Op.in]: allIds }, status: "active" } }), 0);
    for (const value of privateValues) assert.equal(messages.join("\n").includes(value), false);
  } catch (error) {
    fixtures ||= error.fixtures;
    throw error;
  } finally {
    if (server) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    try {
      const ids = [];
      if (fixtures?.run) {
        assert.match(fixtures.run, /^[a-f0-9]{20}$/);
        // Recover only this run's generated users if a response was interrupted.
        const users = await db.User.findAll({ where: {
          email: { [Op.like]: `qa-${fixtures.run}-%` }, fullName: { [Op.like]: `QA ${fixtures.run} %` },
          role: { [Op.in]: ["public", "business_owner"] },
        } });
        assert.ok(users.length <= 3);
        ids.push(...users.map(user => user.userId));
      }
      const actorIds = [...ids, ...(admin ? [admin.userId] : [])];
      if (ids.length) {
        const campaigns = await db.Campaign.findAll({ where: { createdBy: { [Op.in]: ids } } });
        assert.ok(campaigns.every(row => row.title.startsWith(`QA ${fixtures.run} `)));
        const campaignIds = campaigns.map(row => row.campaignId);
        await db.CampaignImage.destroy({ where: { ownerId: { [Op.in]: ids } } });
        await db.ManagementAudit.destroy({ where: { actorId: { [Op.in]: actorIds } } });
        if (campaignIds.length) {
          await db.CampaignReview.destroy({ where: { campaignId: { [Op.in]: campaignIds }, adminId: admin.userId } });
          await db.Lead.destroy({ where: { campaignId: { [Op.in]: campaignIds }, userId: { [Op.in]: ids } } });
          await db.Participation.destroy({ where: { campaignId: { [Op.in]: campaignIds }, userId: { [Op.in]: ids } } });
          await db.Campaign.destroy({ where: { campaignId: { [Op.in]: campaignIds }, createdBy: { [Op.in]: ids } } });
        }
        await db.Business.destroy({ where: { ownerId: { [Op.in]: ids } } });
      }
      if (actorIds.length) {
        await db.UserSession.destroy({ where: { userId: { [Op.in]: actorIds } } });
        await db.User.destroy({ where: { userId: { [Op.in]: actorIds } } });
      }
      if (category) await category.destroy();
    } finally {
      if (directory) await fs.rm(directory, { recursive: true, force: true });
      if (originalUploadDirectory === undefined) delete process.env.CAMPAIGN_UPLOAD_DIR;
      else process.env.CAMPAIGN_UPLOAD_DIR = originalUploadDirectory;
      await db.sequelize.close();
    }
  }
});
