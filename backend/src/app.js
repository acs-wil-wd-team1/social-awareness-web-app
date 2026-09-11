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

app.get('/health', (req, res) => {
    res.status(200).json({
        status: "OK"
    })
});

module.exports = app;