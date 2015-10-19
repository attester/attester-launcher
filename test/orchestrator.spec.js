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

var Q = require("q");
var sinon = require("sinon");
var expect = require("chai").expect;
var log = require("../src/log");
var Orchestrator = require("../src/orchestrator");
var ServerMock = require("./mocks/server");
var launcherMock = require("./mocks/launcher");

describe("orchestrator", function() {

    var orchestrator;
    var logSpy;
    var orchestratorExited;
    var server;
    var clock;

    before(function() {
        log.setVerbose(true);
        clock = sinon.useFakeTimers();
        launcherMock.install();
    });

    after(function() {
        launcherMock.uninstall();
        clock.restore();
        clock = null;
        log.setVerbose(false);
    });

    beforeEach(function() {
        launcherMock.instances = [];
        clock = sinon.useFakeTimers();
        orchestrator = new Orchestrator();
        logSpy = sinon.stub();
        orchestratorExited = Q.Promise(function(resolve) {
            orchestrator.on('exit', function() {
                resolve();
            });
        });
        var serverMock = new ServerMock();
        server = serverMock.mockApi;
        orchestrator.socketIO = sinon.stub();
        orchestrator.socketIO.returns(serverMock.socketApi);
        orchestrator.on('log', logSpy);
        orchestrator.on('log', log);
    });

    afterEach(function() {
        expect(orchestrator.socketIO.calledOnce).to.be.true;
        expect(server.disconnected).to.be.true;
        expect(orchestrator.connected).to.be.false;
        expect(orchestratorExited.inspect().state).to.equal("fulfilled");
        launcherMock.instances = [];
        orchestrator = null;
        orchestratorExited = null;
        logSpy = null;
        server = null;
        return orchestratorExited;
    });

    var infoOrDebugMessage = sinon.match(function(args) {
        return args[0] === "info" || args[0] === "debug";
    }, "infoOrDebugMessage");

    it("simply exits when no campaign is started", function() {
        orchestrator.start({
            server: "http://localhost:7777",
            browsers: {}
        });
        expect(orchestrator.socketIO.calledOnce).to.be.true;
        clock.tick(10);
        server.send("connect");
        clock.tick(100);
        sinon.assert.alwaysCalledWith(logSpy, infoOrDebugMessage);
    });

    it("starts a browser", function() {
        server.status = {
            campaigns: [{
                id: "12345",
                browsers: [{
                    name: "myBrowser",
                    remainingTasks: 10,
                    runningTasks: 0
                }]
            }]
        };
        orchestrator.start({
            server: "http://my.special.host.fr:1234",
            browsers: {
                "myBrowser": {
                    $launcher: "$mock",
                    mySpecialConfig: "myValue"
                }
            }
        });
        expect(orchestrator.socketIO.calledOnce).to.be.true;
        clock.tick(10);
        server.send("connect");
        clock.tick(1000);
        expect(server.slaves).to.have.length(1);
        expect(launcherMock.instances).to.have.length(1);
        var launcherInstance = launcherMock.instances[0];
        expect(launcherInstance.url.hostname).to.equal("my.special.host.fr");
        expect(launcherInstance.url.port).to.equal("1234");
        expect(launcherInstance.url.query.id).to.equal(server.slaves[0]);
        server.send("slaveConnected", {
            id: server.slaves[0],
            displayName: "PhantomJS",
            campaignBrowsers: [{
                campaign: "12345",
                browser: {
                    name: "myBrowser",
                    remainingTasks: 10,
                    runningTasks: 0
                }
            }]
        });
        clock.tick(2000);
        server.status.campaigns[0].browsers[0].remainingTasks = 0;
        server.send("slaveIdle", server.slaves[0]);
        clock.tick(500);
        expect(launcherInstance.stopCalled).to.be.true;
        clock.tick(10);
        server.send("slaveDisconnected", server.slaves[0]);
        clock.tick(10);
        launcherInstance.emit("exit");
        clock.tick(100);
        sinon.assert.alwaysCalledWith(logSpy, infoOrDebugMessage);
    });

});
