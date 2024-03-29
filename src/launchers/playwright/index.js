/*
 * Copyright 2019 Amadeus s.a.s.
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
var events = require("events");
var Q = require("q");
var installRobot = require("./robot");

var PlaywrightLauncher = module.exports = function() {};

util.inherits(PlaywrightLauncher, events.EventEmitter);

PlaywrightLauncher.prototype.start = function(param) {
    var config = param.config;
    var variables = param.variables;
    var self = this;

    var errorHandler = this.onError.bind(this);

    self.stopPromise = Q.Promise(function(resolve) {
        self.stopped = false;
        self.stopResolve = function() {
            self.stopped = true;
            resolve();
        };
    });

    var playwrightPath = config.playwrightPath || "playwright";
    var browserName = config.browser || "chromium";
    var playwrightKeyboardPath = config.playwrightKeyboardPath || (playwrightPath + "/lib/server/usKeyboardLayout.js");

    Q.resolve().then(function() {
            if (!self.stopped) {
                var playwright = require(playwrightPath);
                var browserType = playwright[browserName];
                return browserType.launch(config.launchOptions);
            }
        })
        .then(function(browser) {
            if (browser && !self.stopped) {
                self.browser = browser;
                return browser.newPage(config.contextOptions);
            }
        })
        .then(function(page) {
            if (page && !self.stopped) {
                self.page = page;
                if (config.robot) {
                    return installRobot(page, playwrightKeyboardPath);
                }
            }
        })
        .then(function() {
            if (self.page && !self.stopped) {
                return self.page.goto(variables.replace("${ATTESTER-URL}"));
            }
        })
        .then(function() {
            return self.stopPromise;
        })
        .catch(errorHandler)
        .then(function() {
            var browser = self.browser;
            self.browser = null;
            if (browser) {
                return browser.close();
            }
        }).catch(errorHandler)
        .then(function() {
            self.emit("exit");
        });
};

PlaywrightLauncher.prototype.stop = function() {
    if (this.stopResolve) {
        this.stopResolve();
    }
};

PlaywrightLauncher.prototype.onError = function(error) {
    this.emit("log", ["error", "[error] %s", error + ""]);
};
