"use strict";

const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

const { User, UserSession } = require("../database/models");
const { validateRegistrationInput, validateLoginInput } = require("../utils/authValidation");

const accountTypeToRole = {
  user: "public",
  business: "business_owner",
};

const registerUser = async (input) => {
  const { name, email, password, accountType } = validateRegistrationInput(input);

  const role = accountTypeToRole[accountType];

  const normalizedEmail = email;

  const existing = await User.findOne({
    where: {
      email: normalizedEmail,
    },
  });

  if (existing) {
    const error = new Error("Unable to create your account");
    error.status = 409;
    error.code = "EMAIL_EXISTS";
    error.fieldErrors = {
      email: "Email has already been registered. Please use different email.",
    };

    throw error;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const newUser = await User.create({
    fullName: name,
    email: normalizedEmail,
    passwordHash,
    role,
  });

  return {
    message: "Registered!",
    user: {
      id: newUser.userId,
      name: newUser.fullName,
      role: newUser.role,
    },
  };
};

const loginUser = async (email, password, requestMeta = {}) => {
  const credentials = validateLoginInput({ email, password });

  const user = await User.scope("withPassword").findOne({
    where: {
      email: credentials.email,
    },
  });

  const invalidCredentialsError = () => {
    const error = new Error("Email or password is incorrect");
    error.status = 401;
    error.code = "INVALID_CREDENTIALS";
    error.fieldErrors = null;
    return error;
  };

  if (!user) {
    throw invalidCredentialsError();
  }

  const isMatch = await bcrypt.compare(credentials.password, user.passwordHash);

  if (!isMatch) {
    throw invalidCredentialsError();
  }

  if (user.status === "suspended") {
    const error = new Error("Account is suspended");

    error.status = 403;
    error.code = "ACCOUNT_SUSPENDED";
    error.fieldErrors = null;

    throw error;
  }

  const token = jwt.sign(
    {
      id: user.userId,
      role: user.role,
      status: user.status,
    },
    process.env.JWT_SECRET,
    { expiresIn: "1d" },
  );

  await UserSession.create({
    userId: user.userId,
    token,
    ipAddress: requestMeta.ipAddress,
    userAgent: requestMeta.userAgent?.trim() || "Unknown",
    status: "active",
  });

  return {
    user: {
      id: user.userId,
      name: user.fullName,
      email: user.email,
      role: user.role,
    },
    token,
  };
};

const logoutUser = async (authHeader) => {
  if (typeof authHeader !== "string" || !authHeader) {
    const error = new Error("No token provided");
    error.status = 401;
    error.code = "INVALID_TOKEN";
    error.fieldErrors = null;

    throw error;
  }

  const match = /^Bearer ([^\s]+)$/i.exec(authHeader);
  if (!match) {
    const error = new Error("Invalid authentication token");
    error.status = 401;
    error.code = "INVALID_TOKEN";
    error.fieldErrors = null;

    throw error;
  }
  const token = match[1];

  const [updatedRows] = await UserSession.update(
    {
      status: "expired",
      logoutAt: new Date(),
    },
    {
      where: {
        token,
        status: "active",
      },
    },
  );

  if (updatedRows === 0) {
    const error = new Error("Session expired or already logged out");
    error.status = 401;
    error.code = "INVALID_TOKEN";
    error.fieldErrors = null;
    throw error;
  }

  return;
};

module.exports = {
  registerUser,
  loginUser,
  logoutUser,
};
