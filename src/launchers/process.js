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
var path = require("path");
var events = require("events");
var spawn = require('child_process').spawn;
var streamToLog = require("../util/streamToLog");
var processToPromise = require("../util/processToPromise");

var Process = module.exports = function() {};

util.inherits(Process, events.EventEmitter);

Process.prototype.start = function(param) {
    var self = this;
    var config = param.config;
    var command = config.command;
    var commandArgs = (config.commandArgs || []).concat([param.url]);
    self.emit("log", ["debug", "Executing: %s %s", command, commandArgs.join(" ")]);
    self.processName = path.basename(command, path.extname(command));
    self.processKilled = false;
    var curProcess = self.process = spawn(command, commandArgs, {
        stdio: "pipe"
    });
    var onProcessLog = self.onProcessLog.bind(self);
    streamToLog(curProcess.stdout, onProcessLog);
    streamToLog(curProcess.stderr, onProcessLog);
    processToPromise(curProcess).catch(self.onProcessError.bind(self)).finally(function() {
        self.process = null;
        self.emit("exit");
    });
};

Process.prototype.stop = function() {
    if (this.process) {
        this.processKilled = true;
        this.process.kill();
    }
};

Process.prototype.onProcessLog = function(line) {
    this.emit("log", ["info", "[%s] %s", this.processName, line]);
};

Process.prototype.onProcessError = function(err) {
    if (this.processKilled) {
        // ignore the error if it happened on the process we killed ourselves
        return;
    }
    if (err.code === "ENOENT") {
        this.emit("log", ["error", "%s could not be found.", this.processName]);
        this.emit("disable");
    } else {
        this.emit("log", ["error", err]);
    }
};
