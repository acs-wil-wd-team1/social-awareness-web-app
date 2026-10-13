"use strict";

const { apiErrorResponse } = require("./apiErrorResponse");

function serviceError(status, code, message, fieldErrors = null) {
  return Object.assign(new Error(message), { status, code, fieldErrors });
}

function validationError(fieldErrors, message = "Request data is invalid") {
  return serviceError(422, "VALIDATION_FAILED", message, fieldErrors);
}

// Known 4xx service errors pass through; anything else becomes a safe 500.
function sendServiceError(res, err) {
  if (Number.isInteger(err?.status) && err.status >= 400 && err.status < 500 && err.code) {
    return apiErrorResponse(res, err.status, err.code, err.message, err.fieldErrors ?? null);
  }
  console.error(err);
  return apiErrorResponse(res, 500, "INTERNAL_SERVER_ERROR", "Something went wrong", null);
}

module.exports = { serviceError, validationError, sendServiceError };
