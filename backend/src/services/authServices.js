"use strict";

const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

const { User, UserSession } = require("../database/models");

const accountTypeToRole = {
  user: "public",
  business: "business_owner",
};

const registerUser = async ({
  name,
  email,
  password,
  accountType,
  ...extraFields
}) => {
  if (!name || !email || !password || !accountType) {
    const error = new Error("Registration data is invalid");
    error.status = 422;
    error.code = "VALIDATION_FAILED";
    error.fieldErrors = {
      ...(!name && { name: "Name is required" }),
      ...(!email && { email: "Email is required" }),
      ...(!password && { password: "Password is required" }),
      ...(!accountType && {
        accountType: "Account type is required",
      }),
    };

    throw error;
  }

  if (Object.keys(extraFields).length > 0) {
    const error = new Error("Registration data is invalid");
    error.status = 422;
    error.code = "VALIDATION_FAILED";
    error.fieldErrors = null;

    throw error;
  }

  if (!["user", "business"].includes(accountType)) {
    const error = new Error("Registration data is invalid");
    error.status = 422;
    error.code = "VALIDATION_FAILED";
    error.fieldErrors = {
      accountType: "Account type must be user or business",
    };

    throw error;
  }

  const role = accountTypeToRole[accountType];

  const normalizedEmail = email.trim().toLowerCase();

  const existing = await User.findOne({
    where: {
      email: normalizedEmail,
    },
  });

  if (existing) {
    const error = new Error("Email has already been registered");
    error.status = 409;
    error.code = "EMAIL_EXISTS";
    error.fieldErrors = {
      email: "Email has already been registered",
    };

    throw error;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const newUser = await User.create({
    fullName: name.trim(),
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
  if (!email || !password) {
    const error = new Error("Email and password are required");

    error.status = 422;
    error.code = "VALIDATION_FAILED";
    error.fieldErrors = {
      ...(!email && { email: "Email is required" }),
      ...(!password && { password: "Password is required" }),
    };

    throw error;
  }

  const user = await User.scope("withPassword").findOne({
    where: {
      email: email.trim().toLowerCase(),
    },
  });

  if (!user) {
    const error = new Error("Email or password is incorrect");

    error.status = 401;
    error.code = "INVALID_CREDENTIALS";
    error.fieldErrors = null;

    throw error;
  }

  const isMatch = await bcrypt.compare(password, user.passwordHash);

  if (!isMatch) {
    const error = new Error("Email or password is incorrect");

    error.status = 401;
    error.code = "INVALID_CREDENTIALS";
    error.fieldErrors = null;

    throw error;
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
    userAgent: requestMeta.userAgent,
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
  if (!authHeader) {
    const error = new Error("No token provided");
    error.status = 401;
    error.code = "INVALID_TOKEN";
    error.fieldErrors = null;

    throw error;
  }

  const [scheme, token] = authHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    const error = new Error("Invalid authentication token");
    error.status = 401;
    error.code = "INVALID_TOKEN";
    error.fieldErrors = null;

    throw error;
  }

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
    }
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
  logoutUser
};
