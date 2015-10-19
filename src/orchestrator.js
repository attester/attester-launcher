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

var socketIO = require("socket.io-client");
var util = require("util");

var StateMachine = require("./stateMachine");
var SlaveFactory = require("./slaveFactory");
var copyMap = require("./util/copyMap");

var Orchestrator = module.exports = function() {};

util.inherits(Orchestrator, StateMachine);

Orchestrator.prototype.stateTransitions = {
    "Init": ["Connecting"],
    "Connecting": ["WaitingStatus", "Disconnected"],
    "WaitingStatus": ["Running", "Idle", "Disconnected"],
    "Running": ["Running", "WaitingStatus", "Idle", "Disconnected"],
    "Idle": ["Disconnected"],
    "Disconnected": ["Exiting"],
    "Exiting": ["Exited"]
};

Orchestrator.prototype.stateTimeouts = {
    "WaitingStatus": 10000
};

StateMachine.prototype.onStateTimeout = function() {
    if (this.state == "WaitingStatus") {
        this.emit("log", ["error", "Timeout while waiting for the status of the attester server."]);
        this.socket.disconnect();
    }
};

Orchestrator.prototype.start = function(config) {
    this.config = config;
    this.setState("Connecting");
};

Orchestrator.prototype.onStateConnecting = function() {
    var config = this.config;
    /**
     * URL of the attester server, such as http://localhost:7777/
     * @type String
     */
    this.server = config.server;

    /**
     * SlaveFactories map: the key in the map is the name of a browser, as it can be defined
     * in a campaign. The value in the map is an array of SlaveFactory objects.
     */
    this.slaveFactories = SlaveFactory.createSlaveFactories(config);

    /**
     * maxInstances map: the key in the map is a tag (as it can be found in the tags array of
     * a SlaveFactory object), and the value is the maximum number of browser instances created
     * with a slave factory containing this tag.
     */
    this.maxInstances = copyMap(config.maxInstances || {}, Object.create(null));

    /**
     * Minimum number of tasks per browser. It is used as a limit to never start more browsers
     * than the number of remaining tasks divided by this number. It is used at the time browsers
     * are started, it is not used to stop already started browsers.
     */
    this.minTasksPerBrowser = config.minTasksPerBrowser || 10;

    // State properties: their values are updated when the state changes

    /**
     * Attester status, updated when receiving a new status.
     */
    this.status = null;

    /**
     * Socket.io object for communication with the attester server.
     */
    this.socket = null;

    /**
     * Boolean value, true if this.socket is connected with an attester server.
     */
    this.connected = false;

    /**
     * Map corresponding to the number of slaves currently created, for each tag.
     */
    this.nbInstances = Object.create(null);

    this.slavesById = Object.create(null);
    this.slavesWaitingId = [];

    this.emit("log", ["info", "Connecting to %s", this.server]);
    var socket = this.socket = (this.socketIO || socketIO)(this.server, {
        reconnection: false
    });
    socket.on('connect', this.onSocketConnect.bind(this));
    socket.on('connect_error', this.onSocketConnectError.bind(this));
    socket.on('status', this.onSocketStatus.bind(this));
    socket.on('slaveCreated', this.onSocketSlaveCreated.bind(this));
    socket.on('slaveConnected', this.onSocketSlaveConnected.bind(this));
    socket.on('slaveBusy', this.onSocketSlaveBusy.bind(this));
    socket.on('slaveIdle', this.onSocketSlaveIdle.bind(this));
    socket.on('slaveDisconnected', this.onSocketSlaveDisconnected.bind(this));
    socket.on('disconnect', this.onSocketDisconnect.bind(this));
};

Orchestrator.prototype.stop = function() {
    this.socket.disconnect();
};

Orchestrator.prototype.onSocketConnect = function() {
    this.emit("log", ["info", "Connected to %s", this.server]);
    this.connected = true;
    this.socket.emit("hello", {
        "type": "slaveController"
    });
    this.askStatus();
};

Orchestrator.prototype.onSocketConnectError = function(error) {
    this.emit("log", ["error", "Could not connect to %s: %s", this.server, error + ""]);
    this.setState("Disconnected");
};

Orchestrator.prototype.askStatus = function() {
    if (this.connected && this.state != "WaitingStatus") {
        this.setState("WaitingStatus");
        this.emit("log", ["debug", "Requesting status"]);
        this.socket.emit("status");
    }
};

Orchestrator.prototype.onSocketStatus = function(status) {
    this.emit("log", ["debug", "Received status"]);
    this.status = status;
    this.checkAndStartSlaves();
};

var sortByRemainingTasks = function(browser1, browser2) {
    return browser2.remainingTasks - browser1.remainingTasks;
};

var computeTasksPerBrowser = function(status, slaveFactories) {
    var browsersArray = [];
    var browsersMap = Object.create(null);
    status.campaigns.forEach(function(campaign) {
        campaign.browsers.forEach(function(campaignBrowser) {
            var tasks = campaignBrowser.remainingTasks - campaignBrowser.runningTasks; // we don't take running tasks into account
            if (tasks <= 0) {
                return;
            }
            var browserName = campaignBrowser.name;
            var browser = browsersMap[browserName];
            if (!browser) {
                var slaveFactoriesForBrowser = slaveFactories[browserName];
                if (!slaveFactoriesForBrowser) {
                    return;
                }
                browser = browsersMap[browserName] = {
                    name: browserName,
                    slaveFactories: slaveFactoriesForBrowser,
                    remainingTasks: 0
                };
                browsersArray.push(browser);
            }
            browser.remainingTasks += tasks;
        });
    });
    browsersArray.sort(sortByRemainingTasks); // sort by decreasing number of tasks
    return browsersArray;
};

Orchestrator.prototype.checkAndStartSlaves = function() {
    var browsersToTest = computeTasksPerBrowser(this.status, this.slaveFactories);
    for (var i = 0, l = browsersToTest.length; i < l; i++) {
        var curBrowser = browsersToTest[i];
        var curBrowserMaxSlaves = this.computeMaxSlavesToStartForBrowser(curBrowser);
        var curBrowserSlaveFactories = curBrowser.slaveFactories;
        for (var j = 0, k = curBrowserSlaveFactories.length; j < k && curBrowserMaxSlaves > 0; j++) {
            var curSlaveFactory = curBrowserSlaveFactories[j];
            var curSlaveFactoryMaxSlaves = this.computeMaxSlavesToStartForFactory(curBrowser, curSlaveFactory);
            var instances = Math.min(curBrowserMaxSlaves, curSlaveFactoryMaxSlaves);
            if (instances > 0) {
                this.emit("log", ["info", "%d instance(s) of %s will be started with %s to execute %d remaining task(s)", instances, curSlaveFactory.browserName, curSlaveFactory.name, curBrowser.remainingTasks]);
                this.createSlaves(curSlaveFactory, instances);
                curBrowserMaxSlaves -= instances;
            }
        }
    }
    this.setState(this.isAnySlaveRunning() ? "Running" : "Idle");
};

Orchestrator.prototype.checkRunningSlavesOnExit = function() {
    if (!this.isAnySlaveRunning()) {
        this.setState("Exited");
    }
};

Orchestrator.prototype.isAnySlaveRunning = function() {
    return (this.nbInstances["Any"] || 0) > 0;
};

Orchestrator.prototype.onStateIdle = function() {
    this.emit("log", ["info", "attester-launcher is idle"]);
    this.socket.disconnect();
};

Orchestrator.prototype.computeMaxSlavesToStartForBrowser = function(browser) {
    // computes how many instances of the given browser it would be possible to start
    var maxNumber = Math.max(1, Math.floor(browser.remainingTasks / this.minTasksPerBrowser));
    var alreadyStartedBrowsers = this.nbInstances["Browser_" + browser.name] || 0;
    return maxNumber - alreadyStartedBrowsers;
};

Orchestrator.prototype.computeMaxSlavesToStartForFactory = function(browser, slaveFactory) {
    // computes how many instances of the given launcher it would be possible to start
    var nbInstances = this.nbInstances;
    var alreadyStartedBrowsers = nbInstances[slaveFactory.factoryTag] || 0;
    var result = slaveFactory.getMaxInstances() - alreadyStartedBrowsers;
    var maxInstances = this.maxInstances;
    slaveFactory.tags.forEach(function(tag) {
        var maxForTag = maxInstances[tag];
        if (maxForTag != null) {
            var curNb = nbInstances[tag] || 0;
            result = Math.min(result, maxForTag - curNb);
        }
    });
    return result;
};

Orchestrator.prototype.createSlaves = function(slaveFactory, number) {
    if (number > 0) {
        this.updateSlavesCounts(slaveFactory, number);
        for (var i = 0; i < number; i++) {
            var slave = slaveFactory.createSlave(this.server);
            slave.once("exit", this.onSlaveExited.bind(this, slave));
            slave.on("log", this.onSlaveLog.bind(this, slave));
            this.slavesWaitingId.push(slave);
            this.socket.emit("slaveCreate");
        }
    }
};

Orchestrator.prototype.updateSlavesCounts = function(slaveFactory, count) {
    var nbInstances = this.nbInstances;
    slaveFactory.tags.forEach(function(tag) {
        var curInstances = nbInstances[tag] || 0;
        nbInstances[tag] = curInstances + count;
    });
};

Orchestrator.prototype.onSocketSlaveCreated = function(slaveId) {
    this.emit("log", ["debug", "Received slaveCreated %s", slaveId]);
    if (!this.slavesWaitingId.length) {
        this.emit("log", ["debug", "Sending slaveDelete %s", slaveId]);
        this.socket.emit("slaveDelete", slaveId);
        return;
    }
    var slave = this.slavesWaitingId.shift();
    this.slavesById[slaveId] = slave;
    slave.onSlaveCreated(slaveId);
};

Orchestrator.prototype.onSlaveExited = function(slave) {
    var slaveId = slave.id;
    var found = false;
    if (slaveId) {
        found = slave == this.slavesById[slaveId];
        if (found) {
            delete this.slavesById[slaveId];
            if (this.connected) {
                this.emit("log", ["debug", "Sending slaveDelete %s", slaveId]);
                this.socket.emit("slaveDelete", slaveId);
            }
        }
    } else {
        var index = this.slavesWaitingId.indexOf(slave);
        found = index > -1;
        if (found) {
            this.slavesWaitingId.splice(index, 1);
        }
    }
    if (found) {
        this.updateSlavesCounts(slave.slaveFactory, -1);
        if (this.connected) {
            this.askStatus();
        } else if (this.state == "Exiting") {
            this.checkRunningSlavesOnExit();
        }
    } else {
        // should never happen
        this.emit("log", ["error", "onSlaveExited %s: ASSERT FAILED, slave not found!", slaveId]);
    }
};

Orchestrator.prototype.onSlaveLog = function(slave, logArgs) {
    // logArgs[0] contains the level: debug, info, ...
    logArgs = logArgs.slice(0);
    logArgs[1] = "[%s] " + logArgs[1];
    logArgs.splice(2, 0, slave.id);
    this.emit("log", logArgs);
};

var createSocketSlaveHandler = function(methodName) {
    return function(arg) {
        var slaveId = arg.id || arg;
        this.emit("log", ["debug", "%s", methodName, slaveId]);
        var slave = this.slavesById[slaveId];
        if (slave) {
            slave[methodName](arg);
        } else {
            // should never happen
            this.emit("log", ["error", "%s %s: ASSERT FAILED, slave not found!", methodName, slaveId]);
        }
    };
};

Orchestrator.prototype.onSocketSlaveConnected = createSocketSlaveHandler("onSlaveConnected");
Orchestrator.prototype.onSocketSlaveBusy = createSocketSlaveHandler("onSlaveBusy");
Orchestrator.prototype.onSocketSlaveIdle = createSocketSlaveHandler("onSlaveIdle");
Orchestrator.prototype.onSocketSlaveDisconnected = createSocketSlaveHandler("onSlaveDisconnected");

Orchestrator.prototype.onSocketDisconnect = function() {
    this.setState("Disconnected");
};

Orchestrator.prototype.onStateDisconnected = function() {
    this.connected = false;
    this.emit("log", ["info", "Disconnected from %s", this.server]);
    this.slavesWaitingId.slice(0).forEach(function(slave) {
        slave.stop();
    }, this);
    Object.keys(this.slavesById).forEach(function(slaveId) {
        this.slavesById[slaveId].stop();
    }, this);
    this.setState("Exiting");
};

Orchestrator.prototype.onStateExiting = function() {
    this.checkRunningSlavesOnExit();
};

Orchestrator.prototype.onStateExited = function() {
    this.emit("log", ["info", "Exiting."]);
    this.emit("exit");
};
