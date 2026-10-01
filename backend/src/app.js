const express = require("express");
const cors = require("cors");

const app = express();

const userRoutes = require("./router/authRoutes");
const campaignRoutes = require("./router/campaignRoutes")

app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
  }),
);
app.use(express.json());

app.use("/api/auth", userRoutes);
app.use("/api/campaigns", campaignRoutes)

app.use((err, req, res, next) => {
  if (req.method === "POST" && /^\/api\/campaigns\/?$/i.test(req.path)) {
    const invalidBody = [400, 415, 422].includes(err.status);
    const status = err.status === 413 ? 413 : invalidBody ? 422 : 500;
    return res.status(status).json({
      status,
      code: status === 413 ? "REQUEST_TOO_LARGE" : invalidBody ? "VALIDATION_FAILED" : "INTERNAL_SERVER_ERROR",
      message: status === 413 ? "Request body is too large" : invalidBody ? "Campaign data is invalid" : "Something went wrong",
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
