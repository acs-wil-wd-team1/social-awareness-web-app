"use strict";

const {
  getBusinessProfile,
  updateBusinessProfile,
  isBusinessOwner,
  businessProfile,
  createBusinessProfile,
} = require("../services/businessServices");
const { apiErrorResponse } = require("../utils/apiErrorResponse");

const getMyProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    await isBusinessOwner(userId);

    const result = await getBusinessProfile(userId);

    return res.status(200).json(result);
  } catch (err) {
    console.error(err);

    return apiErrorResponse(
      res,
      err.status || 500,
      err.code || "RETRIEVAL_ERROR",
      err.message || "Failed to retrieve business profile",
      err.fieldErrors ?? null,
    );
  }
};

const updateProfile = async (req, res) => {
  try {
    const businessData = req.body;
    const userId = req.user.id;

    await isBusinessOwner(userId);

    const exists = await businessProfile(userId);

    if (!exists) {
      await createBusinessProfile(businessData, userId);
    } else {
      await updateBusinessProfile(businessData, userId);
    }

    const result = await getBusinessProfile(userId);

    return res.status(200).json(result);
  } catch (err) {
    console.error(err);

    return apiErrorResponse(
      res,
      err.status || 500,
      err.code || "ERROR",
      err.message || "Failed to update business profile",
      err.fieldErrors ?? null,
    );
  }
};

module.exports = {
  getMyProfile,
  updateProfile,
};
