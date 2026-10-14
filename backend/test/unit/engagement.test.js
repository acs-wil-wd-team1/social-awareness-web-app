"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { Op } = require("sequelize");
const { createEngagementService, validateParticipationInput, validateEnquiryInput, parseEngagementPage } = require("../../src/services/engagement");

const contact = { name: "Alex Fixture", email: "alex@example.test", message: "Please share details." };
const user = { id: 7, role: "public" };
const date = new Date("2026-10-13T01:00:00.000Z");
const code = expected => error => error.code === expected;

test("participation accepts exactly joined or withdrawn and rejects ownership overrides", () => {
  for (const status of ["joined", "withdrawn"]) assert.equal(validateParticipationInput({ status }), status);
  for (const body of [null, [], "joined", {}, { status: true }, { status: "Joined" }, { status: "joined", userId: 8 }]) {
    assert.throws(() => validateParticipationInput(body), code("VALIDATION_FAILED"));
  }
});

test("enquiry validates types, boundaries and unknown keys before normalising contact details", () => {
  assert.deepEqual(validateEnquiryInput({ name: "  Alex Fixture ", email: " ALEX@EXAMPLE.TEST ", phone: "  ", message: " Details please. " }), {
    name: "Alex Fixture", email: "alex@example.test", phone: null, message: "Details please.",
  });
  assert.equal(validateEnquiryInput({ ...contact, phone: null }).phone, null);
  assert.equal(validateEnquiryInput({ ...contact, name: "n".repeat(100), message: "m".repeat(2000), phone: "1".repeat(20) }).message.length, 2000);
  for (const body of [null, [], {}, { ...contact, name: 2 }, { ...contact, name: " " },
    { ...contact, name: "n".repeat(101) }, { ...contact, email: [] }, { ...contact, email: "a@b" },
    { ...contact, email: "a b@example.test" }, { ...contact, email: "x".repeat(140) + "@example.test" },
    { ...contact, phone: false }, { ...contact, phone: "1".repeat(21) }, { ...contact, message: null },
    { ...contact, message: "m".repeat(2001) }, ...["campaignId", "businessId", "userId", "status"].map(key => ({ ...contact, [key]: 9 }))]) {
    assert.throws(() => validateEnquiryInput(body), code("VALIDATION_FAILED"));
  }
});

test("engagement pagination accepts explicit limits, rejects malformed values and ignores ownership query keys", () => {
  assert.deepEqual(parseEngagementPage(), { page: 1, pageSize: 10 });
  assert.deepEqual(parseEngagementPage({ page: "2", pageSize: "100", userId: "other", businessId: "other" }), { page: 2, pageSize: 100 });
  for (const value of ["", "0", "-1", "1.1", "01", "1e2", "2147483648", [], ["1"], {}, 1, true]) {
    assert.throws(() => parseEngagementPage({ page: value }), code("VALIDATION_FAILED"));
  }
  assert.throws(() => parseEngagementPage({ pageSize: "101" }), code("VALIDATION_FAILED"));
});

function fixtures({ campaign = { campaignId: 9, businessId: null, status: "approved", deletedAt: null }, participation = null, business = { businessId: 4 }, participationRows = [], leadRows = [], summaries = [] } = {}) {
  const calls = []; const transaction = { LOCK: { UPDATE: "UPDATE" } };
  const model = {
    sequelize: { transaction: async work => { calls.push(["transaction"]); return work(transaction); } },
    User: { findByPk: async (id, options) => { calls.push(["actor", id, options]); return { userId: id, role: id === 8 ? "business_owner" : "public", status: "active" }; } },
    UserSession: { findOne: async options => { calls.push(["session", options]); return { status: "active" }; } },
    Campaign: {
      findByPk: async (id, options) => { calls.push(["campaign", id, options]); return campaign; },
      findAll: async options => { calls.push(["summaries", options]); return summaries; },
    },
    Participation: {
      findOne: async options => { calls.push(["participation", options]); return participation; },
      create: async (values, options) => {
        calls.push(["participation.create", values, options]);
        participation = { ...values, participationId: 12, reload: async opts => { calls.push(["reload", opts]); participation.participatedAt = date; } };
        return participation;
      },
      findAndCountAll: async options => { calls.push(["participations.list", options]); return { count: participationRows.length, rows: participationRows }; },
    },
    Lead: {
      create: async (values, options) => { calls.push(["lead.create", values, options]); return { ...values, leadId: 15, createdAt: date, reload: async () => {} }; },
      findAndCountAll: async options => { calls.push(["leads.list", options]); return { count: leadRows.length, rows: leadRows }; },
    },
    Business: { findOne: async options => { calls.push(["business", options]); return business; } },
  };
  return { service: createEngagementService(model), calls, model };
}

test("own participation can be reconciled without reading private campaign content", async () => {
  const f = fixtures({ campaign: null, participation: { participationId: 12, userId: 7, campaignId: 9, status: "joined", participatedAt: date } });
  const result = await f.service.getParticipation("9", user);
  assert.deepEqual(result, { participation: { id: 12, campaignId: 9, status: "joined", participatedAt: date.toISOString() } });
  assert.deepEqual(f.calls.find(([name]) => name === "participation")[1].where, { campaignId: 9, userId: 7 });
  assert.ok(!f.calls.some(([name]) => name === "campaign"));
});

test("missing own record only discloses approved cause eligibility", async () => {
  assert.deepEqual(await fixtures().service.getParticipation("9", user), { participation: null });
  for (const campaign of [null, { status: "pending" }, { status: "rejected" }, { status: "approved", deletedAt: date }]) {
    await assert.rejects(fixtures({ campaign }).service.getParticipation("9", user), code("CAMPAIGN_NOT_FOUND"));
  }
  await assert.rejects(fixtures({ campaign: { status: "approved", businessId: 4 } }).service.getParticipation("9", user), code("CAMPAIGN_TYPE_MISMATCH"));
});

test("first join locks campaign before participation, uses server owner and returns stored timestamp", async () => {
  const f = fixtures(); const result = await f.service.setParticipation("9", { status: "joined" }, user);
  assert.deepEqual(f.calls.slice(0, 5).map(([name]) => name), ["transaction", "actor", "session", "campaign", "participation"]);
  assert.equal(f.calls[1][2].lock, "UPDATE"); assert.equal(f.calls[2][1].lock, "UPDATE");
  assert.equal(f.calls[3][2].lock, "UPDATE"); assert.equal(f.calls[4][1].lock, "UPDATE");
  const create = f.calls.find(([name]) => name === "participation.create");
  assert.equal(create[1].userId, 7); assert.equal(create[1].campaignId, 9);
  assert.equal(result.participation.participatedAt, date.toISOString());
  assert.ok(f.calls.some(([name]) => name === "reload"));
});

test("withdrawal remains available after deletion but join/rejoin stays blocked", async () => {
  const changes = []; const row = { participationId: 12, userId: 7, campaignId: 9, status: "joined", participatedAt: date,
    update: async values => { changes.push(values); Object.assign(row, values); } };
  const f = fixtures({ campaign: { status: "rejected", deletedAt: date }, participation: row });
  const withdrawn = await f.service.setParticipation("9", { status: "withdrawn" }, user);
  assert.equal(withdrawn.participation.status, "withdrawn"); assert.equal(withdrawn.participation.participatedAt, date.toISOString());
  await f.service.setParticipation("9", { status: "withdrawn" }, user);
  assert.equal(changes.length, 1);
  await assert.rejects(f.service.setParticipation("9", { status: "joined" }, user), code("CAMPAIGN_NOT_FOUND"));
  assert.equal(changes.length, 1);
});

test("withdrawal cannot invent a participation or expose another user's private campaign", async () => {
  const eligible = fixtures();
  await assert.rejects(eligible.service.setParticipation("9", { status: "withdrawn" }, user), code("PARTICIPATION_NOT_FOUND"));
  assert.ok(!eligible.calls.some(([name]) => name === "participation.create"));
  const privateFixture = fixtures({ campaign: { status: "pending" } });
  await assert.rejects(privateFixture.service.setParticipation("9", { status: "withdrawn" }, user), code("CAMPAIGN_NOT_FOUND"));
});

test("history scopes rows to current account and exposes only approved non-deleted summaries", async () => {
  const f = fixtures({ participationRows: [{ participationId: 12, campaignId: 9, status: "joined", participatedAt: date }] });
  const result = await f.service.listParticipation({ pageSize: "1", userId: "8" }, user);
  assert.equal(result.participations[0].campaign, null); assert.equal(result.total, 1);
  const query = f.calls.find(([name]) => name === "participations.list")[1];
  assert.deepEqual(query.where, { userId: 7 }); assert.equal(query.limit, 1); assert.equal(query.offset, 0);
  const summaryQuery = f.calls.find(([name]) => name === "summaries")[1];
  assert.equal(summaryQuery.where.status, "approved"); assert.equal(summaryQuery.where.deletedAt, null); assert.equal(summaryQuery.where.businessId, null);
  assert.deepEqual(summaryQuery.where.campaignId[Op.in], [9]);
});

test("enquiry saves normalised contact fields and server-selected ownership under campaign lock", async () => {
  const f = fixtures({ campaign: { campaignId: 9, status: "approved", businessId: 4 } });
  const result = await f.service.sendEnquiry("9", { ...contact, email: " ALEX@EXAMPLE.TEST " }, user);
  assert.deepEqual(f.calls.slice(0, 5).map(([name]) => name), ["transaction", "actor", "session", "campaign", "lead.create"]);
  const saved = f.calls[4][1]; assert.equal(saved.userId, 7); assert.equal(saved.businessId, 4); assert.equal(saved.campaignId, 9);
  assert.equal(result.enquiry.email, "alex@example.test"); assert.equal(result.enquiry.phone, null); assert.equal(result.enquiry.userId, undefined);
  assert.equal(result.enquiry.createdAt, date.toISOString());
});

test("enquiry rejects wrong campaign type/private records and invalid input without a write", async () => {
  await assert.rejects(fixtures().service.sendEnquiry("9", contact, user), code("CAMPAIGN_TYPE_MISMATCH"));
  for (const campaign of [null, { status: "pending", businessId: 4 }, { status: "approved", businessId: 4, deletedAt: date }]) {
    const f = fixtures({ campaign }); await assert.rejects(f.service.sendEnquiry("9", contact, user), code("CAMPAIGN_NOT_FOUND"));
    assert.ok(!f.calls.some(([name]) => name === "lead.create"));
  }
  const f = fixtures(); await assert.rejects(f.service.sendEnquiry("9", { ...contact, userId: 8 }, user), code("VALIDATION_FAILED"));
  assert.equal(f.calls.length, 0);
});

test("business inbox resolves current owner, filters legacy incomplete leads and never trusts query overrides", async () => {
  const f = fixtures({ leadRows: [{ leadId: 15, campaignId: 9, businessId: 4, ...contact, phone: null, createdAt: date }] });
  const result = await f.service.listBusinessEnquiries({ businessId: "999", userId: "999" }, { id: 8, role: "business_owner" });
  assert.deepEqual(f.calls.find(([name]) => name === "business")[1].where, { ownerId: 8 });
  const where = f.calls.find(([name]) => name === "leads.list")[1].where;
  assert.equal(where.businessId, 4); assert.equal(where.userId[Op.ne], null); assert.equal(where.message[Op.ne], null);
  assert.equal(result.enquiries[0].campaign, null); assert.equal(result.total, 1);
  await assert.rejects(fixtures({ business: null }).service.listBusinessEnquiries({}, { id: 8 }), code("BUSINESS_PROFILE_REQUIRED"));
});

test("every engagement method rechecks account and session inside its transaction before private reads or writes", async () => {
  const methods = [
    service => service.getParticipation("9", user, "session-token"),
    service => service.setParticipation("9", { status: "joined" }, user, "session-token"),
    service => service.listParticipation({}, user, "session-token"),
    service => service.sendEnquiry("9", contact, user, "session-token"),
    service => service.listBusinessEnquiries({}, { id: 8 }, "session-token"),
  ];
  for (const run of methods) {
    const expired = fixtures(); expired.model.UserSession.findOne = async options => {
      assert.equal(options.where.token, "session-token"); assert.equal(options.lock, "UPDATE"); return null;
    };
    await assert.rejects(run(expired.service), code("INVALID_TOKEN"));
    assert.ok(!expired.calls.some(([name]) => ["campaign", "participation", "participations.list", "leads.list", "business", "lead.create"].includes(name)));
    const inactive = fixtures(); inactive.model.User.findByPk = async () => ({ userId: 7, role: "public", status: "suspended" });
    await assert.rejects(run(inactive.service), code("ACCOUNT_SUSPENDED"));
    assert.equal(inactive.calls.length, 1);
  }
});
