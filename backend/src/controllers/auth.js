"use strict";

const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

const { User, UserSession } = require("../database/models");

const getUsers = async (req, res) => {
  try {
    const data = await User.findAll();

    return res.status(200).json(data);
  } catch (err) {
    console.error(err);
  }
};

const registration = async (req, res) => {
  try {
    const { name, email, password, accountType } = req.body;

    if (!name || !email || !password || !accountType) {
      return res.status(422).json({
        status: 422,
        code: "VALIDATION_FAILED",
        message: "Registration data is invalid",
        fieldErrors: {
          ...(!name && { name: "Name is required" }),
          ...(!email && { email: "Email is required" }),
          ...(!password && { password: "Password is required" }),
          ...(!accountType && { accountType: "Account type is required" }),
        },
      });
    }

    if (!["user", "business"].includes(accountType)) {
      return res.status(422).json({
        status: 422,
        code: "VALIDATION_FAILED",
        message: "Registration data is invalid",
        fieldErrors: {
          accountType: "Account type must be user or business",
        },
      });
    }

    const allowedFields = ["name", "email", "password", "accountType"];

    const unknownFields = Object.keys(req.body).filter(
      (field) => !allowedFields.includes(field),
    );

    if (unknownFields.length > 0) {
      return res.status(422).json({
        status: 422,

        code: "VALIDATION_FAILED",

        message: "Registration data is invalid",

        fieldErrors: null,
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const existing = await User.findOne({
      where: {
        email: normalizedEmail,
      },
    });

    if (existing) {
      return res.status(409).json({
        status: 409,
        code: "EMAIL_EXISTS",
        message: "Email has already been registered",
        fieldErrors: {
          email: "Email has already been registered",
        },
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const newUser = await User.create({
      fullName: name.trim(),
      email: normalizedEmail,
      passwordHash,
    });

    return res.status(201).json({
      message: "Registered!",
      user: {
        id: newUser.userId,
        name: newUser.fullName,
        role: newUser.role,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      status: 500,
      code: "SERVER_ERROR",
      message: "Error in creating user",
      fieldErrors: null,
    });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(422).json({
        status: 422,
        code: "VALIDATION_FAILED",
        message: "Email and password are required",
        fieldErrors: {
          ...(!email && { email: "Email is required" }),
          ...(!password && { password: "Password is required" }),
        },
      });
    }

    const user = await User.scope("withPassword").findOne({
      where: {
        email: email.trim().toLowerCase(),
      },
    });

    if (!user) {
      return res.status(401).json({
        status: 401,
        code: "INVALID_CREDENTIALS",
        message: "Email or password is incorrect",
        fieldErrors: null,
      });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);

    if (!isMatch) {
      return res.status(401).json({
        status: 401,
        code: "INVALID_CREDENTIALS",
        message: "Email or password is incorrect",
        fieldErrors: null,
      });
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
      token: token,
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
      status: "active",
    });

    return res.status(200).json({
      user: {
        id: user.userId,
        name: user.fullName,
        email: user.email,
        role: user.role,
      },
      token,
    });
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    res.status(500).json({
      status: 500,
      code: "SERVER_ERROR",
      message: "Server error",
      fieldErrors: null,
    });
  }
};

const logout = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        status: 401,
        code: "INVALID_TOKEN",
        message: "No token provided",
        fieldErrors: null,
      });
    }

    const [scheme, token] = authHeader.split(" ");

    if (scheme !== "Bearer" || !token) {
      return res.status(401).json({
        status: 401,
        code: "INVALID_TOKEN",
        message: "Invalid authentication token",
        fieldErrors: null,
      });
    }

    await UserSession.update(
      {
        status: "expired",
        logoutAt: new Date(),
      },
      {
        where: {
          token: token,
          status: "active",
        },
      },
    );
    return res.status(204).send();
  } catch (err) {
    res.status(500).json({
      status: 500,
      code: "SERVER_ERROR",
      message: "Server error",
      fieldErrors: null,
    });
  }
};

module.exports = {
  getUsers,
  registration,
  login,
  logout,
};
