"use strict";

require("dotenv").config({ quiet: true });

if (process.env.RUN_DB_INTEGRATION !== "1" || process.env.NODE_ENV !== "test"
  || !/^[A-Za-z0-9_]+_test$/.test(process.env.DB_NAME_TEST || "")
  || process.env.DB_NAME_TEST === process.env.DB_NAME
  || !["localhost", "127.0.0.1", "::1"].includes(process.env.DB_HOST)
  || !process.env.JWT_SECRET) {
  throw new Error("Live acceptance regression requires an isolated migrated local test database. Deployed/shared databases are refused.");
}

const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { Op } = require("sequelize");
const db = require("../../src/database/models");
const app = require("../../src/app");
db.sequelize.options.logging = false;

test("the live acceptance script matches actual Express/MySQL API responses and EC2 manifest shape", async () => {
  await db.sequelize.authenticate();
  const { runLiveAcceptance } = await import(pathToFileURL(path.resolve(__dirname, "../../../infra/ec2/acceptance-live.mjs")).href);
  let server;
  let fixtures;
  let category;
  let now = Date.UTC(2026, 9, 13);
  const messages = [];
  const privateValues = new Set();
  const commit = "a".repeat(40);
  const metadata = {
    application: "CauseConnect", mode: "live", commit,
    releaseId: `2026-10-13T16-00-00-000Z-${commit.slice(0, 12)}`, builtAt: "2026-10-13T16:00:00.000Z",
  };
  try {
    category = await db.Category.create({ categoryName: `Acceptance categories ${process.env.CAUSECONNECT_TEST_RUN}` });
    await new Promise((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
    const localOrigin = `http://127.0.0.1:${server.address().port}`;
    const result = await runLiveAcceptance({
      origin: "https://local-regression.example.test", allowQaWrites: true, expectedCommit: commit,
      // Nginx hosting/manifest are checked separately. Every /api call below
      // uses the actual app, middleware, bcrypt, JWT, Sequelize and MySQL.
      fetchImpl: async (url, options) => {
        const target = new URL(url);
        assert.equal(target.origin, "https://local-regression.example.test");
        if (target.pathname === "/release.json") {
          return new Response(JSON.stringify(metadata), { headers: { "Content-Type": "application/json" } });
        }
        if (["/", "/campaigns/new", "/my-campaigns", "/admin/campaigns"].includes(target.pathname)) {
          return new Response("<!doctype html>", { headers: { "Content-Type": "text/html" } });
        }
        assert.ok(target.pathname.startsWith("/api/"));
        if (["/api/auth/register", "/api/auth/login"].includes(target.pathname) && options.body) {
          try {
            const body = JSON.parse(options.body);
            if (typeof body.password === "string") privateValues.add(body.password);
          } catch { /* Deliberately malformed parser fixture. */ }
        }
        const response = await fetch(`${localOrigin}${target.pathname}${target.search}`, options);
        if (target.pathname === "/api/auth/login" && response.status === 200) {
          privateValues.add((await response.clone().json()).token);
        }
        return response;
      },
      clock: () => now, sleep: async milliseconds => { now += milliseconds; },
      emit: message => {
        messages.push(message);
        if (message.startsWith("QA fixture receipt: ")) fixtures = JSON.parse(message.slice("QA fixture receipt: ".length));
      },
    });
    fixtures = result.fixtures;
    assert.equal(result.checks, 11);
    assert.equal(fixtures.userIds.length, 2);
    const campaign = await db.Campaign.findByPk(fixtures.campaignId);
    assert.equal(campaign.status, "pending");
    assert.equal(campaign.createdBy, fixtures.userIds[0]);
    assert.equal(await db.UserSession.count({ where: { userId: { [Op.in]: fixtures.userIds }, status: "active" } }), 0);
    assert.equal(Object.hasOwn(metadata, "apiBaseUrl"), false);
    for (const value of privateValues) assert.equal(messages.join("\n").includes(value), false);
  } catch (error) {
    fixtures ||= error.fixtures;
    throw error;
  } finally {
    if (server) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    try {
      if (fixtures?.userIds.length) {
        const createdUsers = await db.User.findAll({ where: { userId: { [Op.in]: fixtures.userIds } } });
        assert.equal(createdUsers.length, fixtures.userIds.length);
        assert.ok(createdUsers.every(user => user.email.startsWith(`qa-${fixtures.run}-`) && user.role === "public"));
        if (fixtures.campaignId) {
          const campaign = await db.Campaign.findByPk(fixtures.campaignId);
          assert.ok(campaign && campaign.title.startsWith(`QA ${fixtures.run} `) && fixtures.userIds.includes(campaign.createdBy));
          await db.Campaign.destroy({ where: { campaignId: fixtures.campaignId } });
        }
        await db.UserSession.destroy({ where: { userId: { [Op.in]: fixtures.userIds } } });
        await db.User.destroy({ where: { userId: { [Op.in]: fixtures.userIds } } });
      }
      if (category) await category.destroy();
    } finally {
      await db.sequelize.close();
    }
  }
});
