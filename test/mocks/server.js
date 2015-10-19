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
        send: eventEmitter.emit.bind(eventEmitter)
    };
    var asyncSend = function(msg, arg) {
        setTimeout(function() {
            eventEmitter.emit(msg, arg);
        }, 10);
    };
    var afterHelloMsgHandlers = {
        "status": function() {
            asyncSend("status", mockApi.status);
        },
        "slaveCreate": function() {
            var slaveId = ++id + "-" + Date.now();
            mockApi.slaves.push(slaveId);
            asyncSend("slaveCreated", slaveId);
        },
        "slaveDelete": function(slaveId) {
            var index = mockApi.slaves.indexOf(slaveId);
            if (index > -1) {
                mockApi.slaves.splice(index, 1);
                asyncSend("slaveDeleted", slaveId);
            }
        }
    };
    var currentMsgHandlers = {
        "hello": function(args) {
            expect(args).to.deep.equal({
                type: "slaveController"
            });
            currentMsgHandlers = afterHelloMsgHandlers;
        }
    };

    this.socketApi = {
        on: eventEmitter.on.bind(eventEmitter),
        emit: function(message, args) {
            var fn = currentMsgHandlers[message];
            if (!fn) {
                throw new Error("Unexpected message sent to server: " + message);
            }
            fn(args);
        },
        disconnect: function() {
            currentMsgHandlers = {};
            mockApi.disconnected = true;
            eventEmitter.emit("disconnect");
        }
    };
};
