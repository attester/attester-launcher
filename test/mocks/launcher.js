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

var sinon = require("sinon");
var util = require("util");
var events = require("events");
var url = require("url");
var expect = require("chai").expect;
var SlaveFactory = require("../../src/slaveFactory");

var MockLauncher = function() {
    var self = this;
    self.startCalled = false;
    self.stopCalled = false;

    this.start = sinon.spy(function(param) {
        expect(self.startCalled).to.be.false;
        self.startCalled = true;
        self.url = url.parse(param.variables.replace("${ATTESTER-URL}"), true);
        self.config = param.config;
    });
    this.stop = sinon.spy(function() {
        expect(self.startCalled).to.be.true;
        expect(self.stopCalled).to.be.false;
        self.stopCalled = true;
    });
    exports.instances.push(self);
};

util.inherits(MockLauncher, events.EventEmitter);

exports.install = function() {
    exports.instances = [];
    SlaveFactory.builtinLaunchers.$mock = MockLauncher;
};
exports.uninstall = function() {
    exports.instances = null;
    delete SlaveFactory.builtinLaunchers.$mock;
};
