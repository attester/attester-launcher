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

var webdriver = require('selenium-webdriver');
var Q = require("q");
var util = require("util");
var events = require("events");

var WebdriverLauncher = module.exports = function() {};

util.inherits(WebdriverLauncher, events.EventEmitter);

WebdriverLauncher.prototype.start = function(param) {
    var self = this;
    var config = param.config;

    var configError = "";
    if (!config.capabilities || !config.capabilities.browserName) {
        configError += "Missing browserName capability. ";
    }
    if (configError) {
        self.emit("log", ["error", configError]);
        self.emit("disable");
        self.emit("exit");
        return;
    }

    // building the driver:
    var builder = new webdriver.Builder();
    builder.disableEnvironmentOverrides();
    if (config.server) {
        builder.usingServer(config.server);
    }
    builder.withCapabilities(config.capabilities);

    self.url = param.url;
    self.keepAliveDelay = config.keepAliveDelay;
    self.driver = builder.build();

    // starting the browser:
    Q(self.driver.getSession())
        .then(self.onReceivedSession.bind(self))
        .then(self.beginConnection.bind(self))
        .catch(self.onWebdriverError.bind(self))
        .then(function() {
            if (!self.shouldEnd) {
                self.stopPromise = Q.Promise(function(resolve) {
                    self.stopResolve = resolve;
                });
                self.keepConnection();
                return self.stopPromise;
            }
        })
        .finally(self.endConnection.bind(self)).finally(function() {
            self.driver = null;
            self.emit("exit");
        });
};

WebdriverLauncher.prototype.onReceivedSession = function(session) {
    this.emit("log", ["info", "Started session %s", session.getId()]);
    this.emit("log", ["debug", "Capabilities: %j", session.getCapabilities().serialize()]);
};

WebdriverLauncher.prototype.beginConnection = function() {
    return this.driver.get(this.url);
};

WebdriverLauncher.prototype.keepConnection = function() {
    this.keepAliveCallback();
};

WebdriverLauncher.prototype.keepAlive = function() {
    this.keepAliveTimeout = null;
    if (!this.shouldEnd) {
        this.emit("log", ["debug", "Sending keep-alive command (getCurrentUrl)"]);
        Q(this.driver.getCurrentUrl()).then(this.keepAliveCallback.bind(this), this.onWebdriverError.bind(this));
    }
};

WebdriverLauncher.prototype.keepAliveCallback = function() {
    if (!this.shouldEnd && this.keepAliveDelay > -1) {
        this.keepAliveTimeout = setTimeout(this.keepAlive.bind(this), this.keepAliveDelay);
    }
};

WebdriverLauncher.prototype.endConnection = function() {
    if (this.keepAliveTimeout) {
        clearTimeout(this.keepAliveTimeout);
        this.keepAliveTimeout = null;
    }
    return this.driver.quit();
};

WebdriverLauncher.prototype.stop = function() {
    this.shouldEnd = true;
    var stopResolve = this.stopResolve;
    if (stopResolve) {
        this.stopResolve = null;
        stopResolve();
    }
};

WebdriverLauncher.prototype.onWebdriverError = function(error) {
    this.emit("log", ["error", "Error in webdriver: %s", error + ""]);
    this.stop();
};
