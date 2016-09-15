/*
 * Copyright 2015 Amadeus s.a.s.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var util = require("util");

var WebdriverLauncher = require("./webdriver");
var copyMap = require("../util/copyMap");
var mapToJson = require("../util/mapToJson");

var SauceLabsLauncher = module.exports = function() {};

util.inherits(SauceLabsLauncher, WebdriverLauncher);

SauceLabsLauncher.prototype.start = function(param) {
    var config = param.config;
    var configError = "";

    var username = config.username || process.env.SAUCE_USERNAME;
    var accessKey = config.accessKey || process.env.SAUCE_ACCESS_KEY;

    if (!username || !accessKey) {
        configError += "Missing user name and/or access key. ";
    }
    if (!config.capabilities || !config.capabilities.browserName) {
        configError += "Missing browserName capability. ";
    }
    if (configError) {
        this.emit("log", ["error", configError]);
        this.emit("disable");
        this.emit("exit");
        return;
    }

    var capabilities = copyMap(config.capabilities);
    capabilities.username = username;
    capabilities.accessKey = accessKey;

    WebdriverLauncher.prototype.start.call(this, {
        url: param.url,
        config: {
            server: config.server || process.env.SAUCE_SELENIUM_SERVER || "http://ondemand.saucelabs.com/wd/hub",
            capabilities: capabilities,
            keepAliveDelay: config.keepAliveDelay || 45000
        }
    });
};

SauceLabsLauncher.prototype.onReceivedSession = function(session) {
    // overrides the parent method to display the url which allows to follow the current job:
    this.emit("log", ["info", "Started session http://saucelabs.com/jobs/%s", session.getId()]);
    this.emit("log", ["debug", "Capabilities: %j", mapToJson(session.getCapabilities())]);
};
