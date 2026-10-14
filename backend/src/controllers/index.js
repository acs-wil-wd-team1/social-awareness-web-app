const campaigns = require("./campaigns");

module.exports = {
    authController: require("./auth"),
    campaignsController: require("./campaigns"),
    businessController: require("./business"),
    businessCampaignsController: require("./businessCampaigns")
}