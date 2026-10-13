"use strict";

const { createCurrentAccountGuard } = require("./currentAccountAuthentication");

// Admin routes re-check the current database role and status on every request.
function createAdminGuard(models) {
  return createCurrentAccountGuard(models, { roles: ["admin"], forbiddenMessage: "Admin access required" });
}

module.exports = { createAdminGuard };
