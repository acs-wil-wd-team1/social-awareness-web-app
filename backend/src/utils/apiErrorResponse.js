"use strict";

const apiErrorResponse = (res, status, code, message, fieldErrors) => {
  return res.status(status).json({
    status: status,
    code: code,
    message: message,
    fieldErrors: fieldErrors,
  });
};

module.exports = {
  apiErrorResponse,
};
