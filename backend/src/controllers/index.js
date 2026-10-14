const campaigns = require("./campaigns");

module.exports = {
    authController: require("./auth"),
    campaignsController: campaigns,
    // Retain the original alias while callers move to the correctly spelt name.
    campaignsContoller: campaigns,
    businessController: require("./business"),
    businessCampaignsController: require("./businessCampaigns"),
    adminCampaignsController: require("./adminCampaigns"),
}
