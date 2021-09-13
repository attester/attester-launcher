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

var Slave = require("./slave");
var merge = require("./util/merge");
var copyMap = require("./util/copyMap");
var removeDuplicates = require("./util/removeDuplicates");

var factoryCounter = Date.now();

var defaultTimeouts = {
    "Connecting": 120000,
    "Idle": 100,
    "Disconnected": 100,
    "Exiting": 10000
};

var SlaveFactory = module.exports = function(browserName, param) {
    this.browserName = browserName;
    this.name = param.name;
    // factoryTag should be unique accross factories, so that getMaxInstances is correctly used
    this.factoryTag = "Factory_" + (++factoryCounter);
    this.launcherConstructor = param.launcher;
    this.launcherConfig = param.launcherConfig;

    var generalConfig = param.generalConfig;
    var maxInstances = generalConfig.maxInstances;
    this.maxInstances = maxInstances == null ? 1 : maxInstances;

    var tags = param.tags.slice(0);
    tags.push("Browser_" + browserName, this.factoryTag, "Any");
    if (generalConfig.tags) {
        tags = tags.concat(generalConfig.tags.map(function(tag) {
            return "Tag_" + tag;
        }));
    }
    this.tags = removeDuplicates(tags);
    this.urlExtraParameters = generalConfig.urlExtraParameters;

    var timeouts = this.timeouts = {};
    Object.keys(defaultTimeouts).forEach(function(name) {
        timeouts[name] = generalConfig[name.toLowerCase() + "Timeout"] || defaultTimeouts[name];
    }, this);

    // whether a fatal error happened with this factory (which disables it)
    this.fatalError = false;

    this.connectionRetries = generalConfig.connectionRetries || 3;
    this.remainingConnectionRetries = this.connectionRetries;
};

SlaveFactory.prototype.isDisabled = function() {
    return this.fatalError || this.remainingConnectionRetries <= 0;
};

SlaveFactory.prototype.getMaxInstances = function() {
    if (this.isDisabled()) {
        return 0;
    }
    return this.maxInstances;
};

SlaveFactory.prototype.createSlave = function(server) {
    return new Slave(server, this);
};

var builtinLaunchers = SlaveFactory.builtinLaunchers = {
    "$process": require("./launchers/process"),
    "$phantomjs": require("./launchers/phantomjs"),
    "$puppeteer": require("./launchers/puppeteer"),
    "$playwright": require("./launchers/playwright"),
    "$webdriver": require("./launchers/webdriver"),
    "$saucelabs": require("./launchers/saucelabs"),
    "$virtualbox": require("./launchers/virtualbox"),
    "$vboxrobot": require("./launchers/vboxrobot")
};

// processes the configuration of launchers
// handling inheritance...
SlaveFactory.createSlaveFactories = function(config) {
    var slaveFactoriesResult = Object.create(null);
    var processedNamedLaunchers = Object.create(null);
    var namedLaunchersRecDetection = Object.create(null);

    var addRootLauncher = function(name, launcher) {
        processedNamedLaunchers[name] = {
            name: name,
            tags: ["Launcher_" + name],
            launcher: launcher,
            launcherConfig: {},
            generalConfig: {}
        };
    };

    Object.keys(builtinLaunchers).forEach(function(name) {
        addRootLauncher(name, builtinLaunchers[name]);
    });

    // TODO: allow other root launchers to be specified in the config

    var namedLaunchers = config.launchers ? copyMap(config.launchers, Object.create(null)) : Object.create(null);
    var browsers = config.browsers;
    if (!browsers) {
        throw new Error("Missing or invalid 'browsers' property in the configuration!");
    }

    var processLauncher = function(launcher) {
        var launcherConfig = {};
        var generalConfig = {};
        Object.keys(launcher).forEach(function(key) {
            var dst = launcherConfig,
                value = launcher[key];
            if (key.charAt(0) == "$") {
                dst = generalConfig;
                key = key.substring(1);
            }
            dst[key] = value;
        });
        var parentLauncherName = generalConfig.launcher;
        if (typeof parentLauncherName !== "string") {
            throw new Error("Missing or invalid '$launcher' property in the configuration: " + parentLauncherName);
        }
        delete generalConfig.launcher;
        var res = {
            launcherConfig: launcherConfig,
            generalConfig: generalConfig
        };
        var parentLauncher = getNamedLauncher(parentLauncherName);
        return merge(res, parentLauncher);
    };

    var getNamedLauncher = function(launcherName) {
        var res = processedNamedLaunchers[launcherName];
        if (!res) {
            var launcher = namedLaunchers[launcherName];
            if (!launcher) {
                throw new Error("Invalid launcher name: " + launcherName);
            }
            if (namedLaunchersRecDetection[launcherName]) {
                throw new Error("Recursive launchers configuration: " + launcherName);
            }
            namedLaunchersRecDetection[launcherName] = true;
            res = processLauncher(launcher);
            res.name = launcherName;
            res.tags = res.tags.slice(0);
            res.tags.push("Launcher_" + launcherName);
            processedNamedLaunchers[launcherName] = res;
        }
        return res;
    };

    var createSlaveFactory = function(browserName, launcher) {
        var processedLauncher = typeof launcher == "string" ? getNamedLauncher(launcher) : processLauncher(launcher);
        return new SlaveFactory(browserName, processedLauncher);
    };

    Object.keys(browsers).forEach(function(curBrowserName) {
        var curBrowserLaunchers = browsers[curBrowserName];
        var curBrowserSlaveFactories = [];
        if (!Array.isArray(curBrowserLaunchers)) {
            curBrowserLaunchers = [curBrowserLaunchers];
        }
        curBrowserLaunchers.forEach(function(curLauncher) {
            var curLauncherSlaveFactory = createSlaveFactory(curBrowserName, curLauncher);
            if (curLauncherSlaveFactory) {
                curBrowserSlaveFactories.push(curLauncherSlaveFactory);
            }
        });
        if (curBrowserSlaveFactories.length > 0) {
            slaveFactoriesResult[curBrowserName] = curBrowserSlaveFactories;
        }
    });

    return slaveFactoriesResult;
};
