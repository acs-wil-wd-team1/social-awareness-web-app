const express = require("express");
const cors = require("cors");

const app = express();

const userRoutes = require("./router/authRoutes");
const campaignRoutes = require("./router/campaignRoutes");
const businessRoutes = require("./router/businessRoutes");
const models = require("./database/models");
const { createCampaignImageRouter } = require("./router/campaignImageRoutes");

app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
  }),
);
app.use(express.json());

app.use("/api/auth", userRoutes);
app.use("/api/campaign-images", createCampaignImageRouter(models));
app.use("/api", require("./router/campaignManagementRoutes"));
app.use("/api", require("./router/engagementRoutes"));
app.use("/api/campaigns", campaignRoutes);
app.use("/api/business", businessRoutes);
app.use("/api", (req, res) => res.status(404).json({ status: 404, code: "NOT_FOUND", message: "API route not found", fieldErrors: null }));

app.use((err, req, res, next) => {
  if (/^\/api\/auth(\/|$)/i.test(req.path)) {
    const invalidBody = [400, 415, 422].includes(err.status);
    const status = err.status === 413 ? 413 : invalidBody ? 422 : 500;
    if (status === 500) {
      // Parser errors may contain request snippets. Never log an auth error's
      // stack, body or SQL parameters, even before its controller is reached.
      console.error("Authentication request failed", { status, code: "INTERNAL_SERVER_ERROR" });
    }
    return res.status(status).json({
      status,
      code: status === 413 ? "REQUEST_TOO_LARGE" : invalidBody ? "VALIDATION_FAILED" : "INTERNAL_SERVER_ERROR",
      message: status === 413 ? "Request body is too large" : invalidBody ? "Account data is invalid" : "Something went wrong",
      fieldErrors: invalidBody ? { body: "Send a valid JSON object" } : null,
    });
  }
  // JSON body errors on campaign writes (create and admin review) use the API error envelope.
  if (/^\/api(\/|$)/i.test(req.path)) {
    const invalidBody = [400, 415, 422].includes(err.status);
    const status = err.status === 413 ? 413 : invalidBody ? 422 : 500;
    return res.status(status).json({
      status,
      code: status === 413 ? "REQUEST_TOO_LARGE" : invalidBody ? "VALIDATION_FAILED" : "INTERNAL_SERVER_ERROR",
      message: status === 413 ? "Request body is too large" : invalidBody
        ? (/^\/api\/business(\/|$)/i.test(req.path) ? "Business profile data is invalid" : "Campaign data is invalid")
        : "Something went wrong",
      fieldErrors: invalidBody ? { body: "Send a valid JSON object" } : null,
    });
  }
  return next(err);
});

app.get('/health', (req, res) => {
    res.status(200).json({
        status: "OK"
    })
});

module.exports = app;
