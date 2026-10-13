"use strict";

const { validationError } = require("./serviceError");

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const registrationFields = new Set(["name", "email", "password", "accountType"]);

function requireBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw validationError({ body: "Send a JSON object containing the account fields" }, "Account data is invalid");
  }
}

function credentials(body, errors) {
  let email;
  if (typeof body.email !== "string" || !body.email.trim()) {
    errors.email = "Email is required";
  } else {
    email = body.email.trim().toLowerCase();
    if (email.length > 150) errors.email = "Use 150 characters or fewer";
    else if (!emailPattern.test(email)) errors.email = "Please enter a valid email address";
  }

  if (typeof body.password !== "string" || !body.password.trim()) {
    errors.password = "Password is required";
  } else if (Buffer.byteLength(body.password, "utf8") > 72) {
    // bcrypt uses only the first 72 bytes: reject silent password truncation.
    errors.password = "Use a password of no more than 72 UTF-8 bytes";
  }

  return { email, password: body.password };
}

function validateRegistrationInput(body) {
  requireBody(body);
  const errors = {};
  const unknown = Object.keys(body).filter((field) => !registrationFields.has(field));
  if (unknown.length) {
    throw validationError(null, `Unsupported registration field${unknown.length > 1 ? "s" : ""}: ${unknown.join(", ")}`);
  }

  let name;
  if (typeof body.name !== "string" || !body.name.trim()) errors.name = "Name is required";
  else {
    name = body.name.trim();
    if (name.length > 100) errors.name = "Use 100 characters or fewer";
  }

  const values = credentials(body, errors);
  if (!["user", "business"].includes(body.accountType)) {
    errors.accountType = body.accountType == null || body.accountType === ""
      ? "Account type is required" : "Account type must be user or business";
  }

  if (Object.keys(errors).length) throw validationError(errors, "Registration data is invalid");
  return { name, ...values, accountType: body.accountType };
}

function validateLoginInput(body) {
  requireBody(body);
  const errors = {};
  const values = credentials(body, errors);
  if (Object.keys(errors).length) throw validationError(errors, "Email and password are invalid");
  return values;
}

module.exports = { validateRegistrationInput, validateLoginInput };
