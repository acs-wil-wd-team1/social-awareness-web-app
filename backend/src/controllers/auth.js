"use strict";

const { apiErrorResponse } = require("../utils/apiErrorResponse");
const { validateLoginInput } = require("../utils/authValidation");

const {
  registerUser,
  loginUser,
  logoutUser,
} = require("../services/authServices");

function sendAuthError(res, error, action) {
  if (Number.isInteger(error?.status) && error.status >= 400 && error.status < 500 && error.code) {
    return apiErrorResponse(res, error.status, error.code, error.message, error.fieldErrors ?? null);
  }
  // Database errors can contain SQL parameters. Never log credentials, tokens
  // or request bodies, and do not return internal error details to the browser.
  console.error("Authentication request failed", { action, status: 500, code: "INTERNAL_SERVER_ERROR" });
  return apiErrorResponse(res, 500, "INTERNAL_SERVER_ERROR", "Something went wrong", null);
}

// REGISTRATION
const registration = async (req, res) => {
  try {
    const result = await registerUser(req.body);

    return res.status(201).json(result);
  } catch (err) {
    return sendAuthError(res, err, "registration");
  }
};

// LOGIN
const login = async (req, res) => {
  try {
    const { email, password } = validateLoginInput(req.body);

    const result = await loginUser(email, password, {
      ipAddress: req.ip,
      userAgent: req.get("user-agent")
    });

    return res.status(200).json(result);
  } catch (err) {
    return sendAuthError(res, err, "login");
  }
};

// LOGOUT
const logout = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    await logoutUser(authHeader);

    res.status(204).send();
  } catch (err) {
    return sendAuthError(res, err, "logout");
  }
};

module.exports = {
  registration,
  login,
  logout,
};
