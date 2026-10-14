"use strict";

const { Business, User } = require("../database/models");
const { apiErrorResponse } = require("../utils/apiErrorResponse");

const isBusinessOwner = async (userId) => {
  const businessOwner = await User.findOne({
    where: {
      userId: userId,
      role: "business_owner",
    },
  });

  if (!businessOwner) {
    const error = new Error("Access denied. Business owners only");
    error.status = 403;
    error.code = "ACCESS_DENIED";
    error.field = null;

    throw error;
  }
  return;
};

const businessProfile = (userId) => {
  const business = Business.findOne({
    where: {
      ownerId: userId,
    },
    attributes: ["businessId", "businessName", "abn", "website", "description"],
  });

  return business;
};

const inputValidation = (businessData) => {

  if (
    businessData === null ||
    typeof businessData !== "object" ||
    Array.isArray(businessData)
  ) {
    const error = new Error("Request body must be a JSON object");

    error.status = 400;
    error.code = "VALIDATION_ERROR";

    throw error;
  }
  
  const { businessName, abn, website, description } = businessData;

  const errors = {};

  const allowedFields = ["businessName", "abn", "website", "description"];
  

  const unexpectedFields = Object.keys(businessData).filter(
    (field) => !allowedFields.includes(field),
  );

  if (unexpectedFields.length > 0) {
    errors.fields = `Unexpected fields: ${unexpectedFields.join(", ")}`;
  }

  // Business name (required)
  if (typeof businessName !== "string" || !businessName.trim()) {
    errors.businessName = "Business name is required";
  } else if (businessName.length > 255) {
    errors.businessName = "Business name must not exceed 255 characters";
  }

  // ABN (optional)
  if (abn != null && abn !== "") {
    if (typeof abn !== "string" || !/^\d{11}$/.test(abn)) {
      errors.abn = "ABN must contain exactly 11 digits";
    }
  }

  // Website (optional)
  if (website != null && website !== "") {
    if (typeof website !== "string") {
      errors.website = "Website must be a string";
    } else if (website.length > 2048) {
      errors.website = "Website must not exceed 2048 characters";
    } else {
      try {
        const url = new URL(website);

        if (!["http:", "https:"].includes(url.protocol)) {
          errors.website = "Website must use HTTP or HTTPS";
        }
      } catch {
        errors.website = "Invalid website URL";
      }
    }
  }

  // Description (optional)
  if (description != null) {
    if (typeof description !== "string") {
      errors.description = "Description must be a string";
    } else if (description.length > 2000) {
      errors.description = "Description must not exceed 2000 characters";
    }
  }

  if (Object.keys(errors).length > 0) {
    const error = new Error("Invalid business profile data");
    error.status = 400;
    error.code = "VALIDATION_ERROR";
    error.fieldErrors = errors;

    throw error;
  }

  return businessData;
};

const getBusinessProfile = async (userId) => {
  const business = await businessProfile(userId);

  if (!business)
    return {
      business: null,
    };

  return {
    business: {
      id: business.businessId,
      businessName: business.businessName,
      abn: business.abn,
      website: business.website,
      description: business.description,
    },
  };
};

const updateBusinessProfile = async (businessData, userId) => {

  inputValidation(businessData);

  const { businessName, abn, website, description } = businessData;

  await Business.update(
    {
      businessName,
      abn,
      website,
      description,
    },
    {
      where: { ownerId: userId },
    },
  );
};

const createBusinessProfile = async (businessData, userId) => {
  const { businessName, abn, website, description } = businessData;

  await inputValidation(businessData);

  await Business.create({
    ownerId: userId,
    businessName,
    abn,
    website,
    description,
  });
};

module.exports = {
  isBusinessOwner,
  businessProfile,
  getBusinessProfile,
  updateBusinessProfile,
  createBusinessProfile,
};
