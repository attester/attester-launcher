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
var events = require("events");
var path = require("path");
var spawn = require('child_process').spawn;
var Q = require("q");
var streamToLog = require("../util/streamToLog");
var processToPromise = require("../util/processToPromise");
var buildCommandLine = require("../util/buildCommandLine");

var VirtualBoxLauncher = module.exports = function() {};

var counter = 0;

util.inherits(VirtualBoxLauncher, events.EventEmitter);

VirtualBoxLauncher.prototype.start = function(param) {
    var self = this;
    var config = param.config;
    var virtualboxPath = config.vboxInstallPath || process.env.VBOX_INSTALL_PATH || process.env.VBOX_MSI_INSTALL_PATH;

    var configError = "";
    if (!virtualboxPath) {
        configError += "Missing Virtual Box path. ";
    }
    if (!config.vm || !config.snapshot || !config.username || !config.command) {
        configError += "At least one of the following mandatory properties is missing: vm, snapshot, username, command. ";
    }

    if (configError) {
        self.emit("log", ["error", configError]);
        self.emit("disable");
        self.emit("exit");
        return;
    }

    self.vboxCommand = path.join(virtualboxPath, "VBoxManage");
    self.vboxVM = "VM-" + (++counter) + "-" + Date.now() + "-" + config.vm;
    self.vboxCloneSuccessful = false;
    self.vboxStartSuccessful = false;

    self.vboxExec(["clonevm", config.vm, "--name", self.vboxVM, "--snapshot", config.snapshot, "--options", "link", "--register"])
        .then(function() {
            self.vboxCloneSuccessful = true;
            return self.vboxExec(["startvm", self.vboxVM, "--type", "headless"]);
        })
        .then(function() {
            self.vboxStartSuccessful = true;
            var commandLine = buildCommandLine(config.command, config.commandArgs, "${ATTESTER-URL}", param.variables);
            var args = ["guestcontrol", self.vboxVM, "run", "--wait-stdout", "--wait-stderr", "--username", config.username, "--password", config.password || "", "--exe", commandLine[0], "--"].concat(commandLine);
            return self.vboxExec(args);
        })
        .finally(function() {
            if (self.vboxStartSuccessful) {
                return self.vboxExec(["controlvm", self.vboxVM, "poweroff"]);
            }
        })
        .finally(function() {
            if (self.vboxCloneSuccessful) {
                return self.vboxExec(["unregistervm", self.vboxVM, "--delete"]);
            }
        })
        .finally(function() {
            self.emit("exit");
        });
};

VirtualBoxLauncher.prototype.vboxExec = function(args) {
    var self = this;
    var cmdLine = self.vboxCommand + " " + args.join(" ");
    self.emit("log", ["debug", "Executing: %s", cmdLine]);
    this.currentProcessKilled = false;
    self.currentProcessType = args[0];
    var child = self.currentProcess = spawn(self.vboxCommand, args, {
        stdio: "pipe"
    });
    var onVboxLog = self.onVboxLog.bind(self);
    streamToLog(child.stdout, onVboxLog);
    streamToLog(child.stderr, onVboxLog);
    return processToPromise(child).catch(self.onVboxError.bind(this)).finally(function() {
        this.currentProcessKilled = false;
        self.currentProcessType = null;
        self.currentProcess = null;
    });
};

VirtualBoxLauncher.prototype.onVboxLog = function(line) {
    this.emit("log", ["info", "[VBoxManage] %s", line]);
};

VirtualBoxLauncher.prototype.onVboxError = function(err) {
    if (this.currentProcessKilled) {
        // ignore the error without propagating it if it happened on the process
        // we killed ourselves
        return;
    }
    if (err.code === "ENOENT") {
        this.emit("log", ["error", "VBoxManage could not be found."]);
        this.emit("disable");
    } else {
        this.emit("log", ["error", err]);
    }
    return Q.reject(err); // propagates the exception (to skip commands)
};

VirtualBoxLauncher.prototype.stop = function() {
    if (this.currentProcessType === "guestcontrol") {
        this.currentProcessKilled = true;
        this.currentProcess.kill();
    }
};
