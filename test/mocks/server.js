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

var events = require("events");
var expect = require("chai").expect;

module.exports = function() {
    var id = 0;
    var eventEmitter = new events.EventEmitter();
    var mockApi = this.mockApi = {
        status: {
            campaigns: []
        },
        slaves: [],
        disconnected: false,
        connect: function() {
            eventEmitter.emit("open");
        },
        send: function(data) {
            var message = JSON.stringify(data);
            eventEmitter.emit("message", message);
        }
    };
    var asyncSend = function(data) {
        setTimeout(function() {
            mockApi.send(data);
        }, 10);
    };
    var afterHelloMsgHandlers = {
        "status": function() {
            asyncSend({
                type: "status",
                status: mockApi.status
            });
        },
        "slaveCreate": function() {
            var slaveId = ++id + "-" + Date.now();
            mockApi.slaves.push(slaveId);
            asyncSend({
                type: "slaveCreated",
                slaveId: slaveId
            });
        },
        "slaveDelete": function(slaveId) {
            var index = mockApi.slaves.indexOf(slaveId);
            if (index > -1) {
                mockApi.slaves.splice(index, 1);
                asyncSend({
                    type: "slaveDeleted",
                    slaveId: slaveId
                });
            }
        }
    };
    var currentMsgHandlers = {
        "slaveController": function(data) {
            expect(data).to.deep.equal({
                type: "slaveController"
            });
            currentMsgHandlers = afterHelloMsgHandlers;
        }
    };

    this.socketApi = {
        on: eventEmitter.on.bind(eventEmitter),
        send: function(message) {
            var data = JSON.parse(message);
            var type = data.type;
            if (!currentMsgHandlers.hasOwnProperty(type)) {
                throw new Error("Unexpected message sent to server: " + message);
            }
            var fn = currentMsgHandlers[type];
            fn(data);
        },
        close: function() {
            currentMsgHandlers = {};
            mockApi.disconnected = true;
            eventEmitter.emit("close");
        }
    };
};
