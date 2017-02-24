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
var StateMachine = require("./stateMachine");
var url = require("url");
var VariablesSet = require("./util/variablesSet");

var Slave = module.exports = function(server, slaveFactory) {
    this.server = server;
    this.slaveFactory = slaveFactory;
    this.id = null;
    this.stateTimeouts = slaveFactory.timeouts;
};

util.inherits(Slave, StateMachine);

Slave.prototype.stateTransitions = {
    "Init": ["Connecting", "Exited"],
    "Connecting": ["Connected", "Exiting", "Exited"],
    "Connected": ["Connected", "Disconnected", "Idle", "Exiting", "Exited"],
    "Disconnected": ["Connected", "Exiting", "Exited"],
    "Idle": ["Connected", "Disconnected", "Exiting", "Exited"],
    "Exiting": ["Exited"]
};

Slave.prototype.onLauncherExit = function() {
    if (this.state == "Exiting") {
        this.emit("log", ["info", "The browser exited as expected"]);
    } else {
        this.emit("log", ["error", "The browser exited unexpectedly (in state %s)", this.state]);
        if (this.state == "Connecting") {
            this.notifyConnectionFailure();
        }
    }
    this.setState("Exited");
};

Slave.prototype.onLauncherLog = function(logArgs) {
    this.emit("log", logArgs);
};

Slave.prototype.onSlaveCreated = function(id) {
    this.id = id;
    this.setState("Connecting");
};

Slave.prototype.onSlaveConnected = function(info) {
    this.emit("log", ["info", "The browser is connected"]);
    this.checkCampaignBrowsers(info);
    this.setState("Connected");
};

Slave.prototype.checkCampaignBrowsers = function(info) {
    var campaignBrowsers = info.campaignBrowsers;
    var expectedBrowserName = this.slaveFactory.browserName;
    var foundExpectedBrowserName = false;
    for (var i = 0, l = campaignBrowsers.length; i < l; i++) {
        var curCampaignBrowser = campaignBrowsers[i].browser;
        if (curCampaignBrowser.name == expectedBrowserName) {
            // checking that the actual slave matches the expected campaign browser
            foundExpectedBrowserName = true;
        }
    }
    if (!foundExpectedBrowserName) {
        // If the browser was not disabled at this point, it could lead to an endless loop:
        // attester-launcher would start a browser, thinking it has tasks to execute
        // the browser starts and successfully connects to attester
        // the browser is idle, because it does not match the browser which has tasks to execute
        // the browser is stopped... then it can be started again and again
        this.emit("log", ["error", "The connected browser does not match the expected %s browser: %s", expectedBrowserName, info.displayName]);
        this.onDisable();
    }
};

Slave.prototype.onSlaveDisconnected = function() {
    if (this.state != "Exiting") {
        this.emit("log", ["error", "The browser got disconnected"]);
        this.setState("Disconnected");
    }
};

Slave.prototype.onSlaveBusy = function() {
    this.emit("log", ["info", "The browser is busy"]);
    this.setState("Connected");
};

Slave.prototype.onSlaveIdle = function() {
    this.emit("log", ["info", "The browser is idle"]);
    this.setState("Idle");
};

Slave.prototype.onStateTimeout = function() {
    if (this.state == "Exiting") {
        this.setState("Exited");
    } else {
        if (this.state == "Connecting") {
            this.emit("log", ["error", "Timeout reached while waiting for the browser to connect"]);
            this.notifyConnectionFailure();
        }
        this.setState("Exiting");
    }
};

Slave.prototype.onStateConnected = function() {
    this.notifyConnectionSuccess();
};

Slave.prototype.onStateConnecting = function() {
    if (this.slaveFactory.isDisabled()) {
        this.setState("Exited");
        return;
    }
    var variables = new VariablesSet();
    variables.values["ATTESTER-SLAVEID"] = this.id;
    variables.values["ATTESTER-HOSTNAME"] = url.parse(this.server).hostname;
    var slaveURL = this.server.replace(/\/$/, "") + "/__attester__/slave.html?id=" + encodeURIComponent(this.id);
    var urlExtraParameters = this.slaveFactory.urlExtraParameters;
    if (urlExtraParameters) {
        slaveURL += "&" + variables.replace(urlExtraParameters);
    }
    variables.values["ATTESTER-URL"] = slaveURL;
    this.emit("log", ["info", "Starting an instance of %s with %s", this.slaveFactory.browserName, this.slaveFactory.name]);
    try {
        this.launcher = new this.slaveFactory.launcherConstructor();
        this.launcher.on("log", this.onLauncherLog.bind(this));
        this.launcher.once("exit", this.onLauncherExit.bind(this));
        this.launcher.on("disable", this.onDisable.bind(this));
        this.launcher.start({
            variables: variables,
            config: this.slaveFactory.launcherConfig
        });
    } catch (e) {
        this.emit("log", ["error", "Error while starting the launcher: %s", e + ""]);
        this.onDisable();
        this.setState("Exited");
    }
};

Slave.prototype.onStateExiting = function() {
    try {
        this.launcher.stop();
    } catch (e) {
        this.emit("log", ["error", "Error while stopping the launcher: %s", e + ""]);
        this.setState("Exited");
    }
};

Slave.prototype.onStateExited = function() {
    this.emit("exit");
    this.launcher = null;
};

Slave.prototype.onDisable = function() {
    var slaveFactory = this.slaveFactory;
    if (!slaveFactory.fatalError) {
        slaveFactory.fatalError = true;
        this.emit("log", ["warn", "It is now disabled to create instances of %s with %s", slaveFactory.browserName, slaveFactory.name]);
    }
};

Slave.prototype.stop = function() {
    if (this.state == "Init") {
        this.setState("Exited");
    } else if (this.state != "Exiting") {
        this.setState("Exiting");
    }
};

Slave.prototype.notifyConnectionFailure = function() {
    var slaveFactory = this.slaveFactory;
    slaveFactory.remainingConnectionRetries--;
    if (slaveFactory.fatalError) {
        // nothing to display, the slave factory is already disabled
    } else if (slaveFactory.remainingConnectionRetries > 0) {
        this.emit("log", ["error", "Creating an instance of %s with %s failed %d time(s) (remaining count: %d)", slaveFactory.browserName, slaveFactory.name, slaveFactory.connectionRetries - slaveFactory.remainingConnectionRetries, slaveFactory.remainingConnectionRetries]);
    } else if (slaveFactory.remainingConnectionRetries === 0) {
        this.emit("log", ["error", "Creating instances of %s with %s failed %d time(s), giving up!", slaveFactory.browserName, slaveFactory.name, slaveFactory.connectionRetries]);
    }
};

Slave.prototype.notifyConnectionSuccess = function() {
    // when there is a successful connection, the counter is reset to its initial value:
    var slaveFactory = this.slaveFactory;
    slaveFactory.remainingConnectionRetries = slaveFactory.connectionRetries;
};
