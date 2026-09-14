const { apiErrorResponse } = require("../utils/apiErrorResponse");

const requireAdmin = (req, res, next) => {
  if (req.user.role !== "admin") {
    return apiErrorResponse(
      res,
      403,
      "FORBIDDEN",
      "Admin access required",
      null
    );
  }

  next();
};

module.exports = requireAdmin;