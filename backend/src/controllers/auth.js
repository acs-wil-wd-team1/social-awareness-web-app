"use strict";

const { apiErrorResponse } = require("../utils/apiErrorResponse");

const {
  registerUser,
  loginUser,
  logoutUser,
} = require("../services/authServices");

// REGISTRATION
const registration = async (req, res) => {
  try {
    const { name, email, password, accountType, ...extraFields } = req.body;
    
    const result = await registerUser({
      name,
      email,
      password,
      accountType,
      extraFields
    });

    return res.status(201).json(result);
  } catch (err) {
    console.error(err);

    return apiErrorResponse(
      res,
      err.status || 500,
      err.code || "INTERNAL_SERVER_ERROR",
      err.message || "Something went wrong",
      err.fieldErrors ?? null,
    );
  }
};

// LOGIN
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const result = await loginUser(email, password, {
      ipAddress: req.ip,
      userAgent: req.get("user-agent")
    });

    return res.status(200).json(result);
  } catch (err) {
    console.error(err);

    const status = err.status || 500;

    return apiErrorResponse(
      res,
      status,
      err.code || "INTERNAL_SERVER_ERROR",
      status === 500 ? "Something went wrong" : err.message,
      err.fieldErrors ?? null,
    );
  }
};

// LOGOUT
const logout = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    await logoutUser(authHeader);

    res.status(204).send();
  } catch (err) {
    console.log(err);

    const status = err.status || 500;
    
    return apiErrorResponse(
      res,
      status || 500,
      err.code || "INTERNAL_SERVER_ERROR",
      status === 500 ? "Something went wrong" : err.message,
      err.fieldErrors ?? null,
    );
  }
};

module.exports = {
  registration,
  login,
  logout,
};
