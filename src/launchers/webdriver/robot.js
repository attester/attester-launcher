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
var Q = require("q");
var webdriver = require('selenium-webdriver');
var KEYS_MAP = require('./keys').KEYS_MAP;

// Note: the following function is stringified by webdriver to be run in the browser
var script = function() {
    /* globals window: false */
    var SeleniumJavaRobot = window.SeleniumJavaRobot;
    if (!SeleniumJavaRobot) {
        var callIds = 0;
        var calls = [];
        var slice = calls.slice;
        var notifyRobot = null;
        var notifyRobotTimeout = null;

        var callNotifyRobot = function(response) {
            if (notifyRobotTimeout) {
                clearTimeout(notifyRobotTimeout);
                notifyRobotTimeout = null;
            }
            var fn = notifyRobot;
            if (fn) {
                notifyRobot = null;
                fn(response);
            }
        };

        var notifyRobotIfNeeded = function() {
            if (notifyRobot && calls.length > 0) {
                callNotifyRobot(calls[0].call);
            }
        };

        var notifyRobotOnTimeout = function() {
            notifyRobotIfNeeded();
            callNotifyRobot(null);
        };

        SeleniumJavaRobot = window.SeleniumJavaRobot = {
            __getInfo: function(cb) {
                notifyRobot = cb;
                notifyRobotTimeout = setTimeout(notifyRobotOnTimeout, 1000);
                notifyRobotIfNeeded();
            },
            __callback: function(callId, result) {
                var curCall = calls[0];
                if (curCall && calls[0].call.id == callId) {
                    calls.shift();
                    setTimeout(function() {
                        var curCallback = curCall.callback;
                        if (typeof curCallback == "function") {
                            curCallback = {
                                fn: curCallback
                            };
                        }
                        if (curCallback && typeof curCallback.fn == "function") {
                            curCallback.fn.call(curCallback.scope, result, curCallback.args);
                        }
                    }, 0);
                }
            }
        };

        var createFunction = function(name, argsNumber) {
            SeleniumJavaRobot[name] = function() {
                var curCallId = "c" + callIds;
                callIds++;
                calls.push({
                    call: {
                        name: name,
                        id: curCallId,
                        args: slice.call(arguments, 0, argsNumber)
                    },
                    callback: arguments[argsNumber]
                });
                notifyRobotIfNeeded();
            };
        };

        createFunction("mouseMove", 2);
        createFunction("smoothMouseMove", 5);
        createFunction("mousePress", 1);
        createFunction("mouseRelease", 1);
        createFunction("mouseWheel", 1);
        createFunction("keyPress", 1);
        createFunction("keyRelease", 1);
        createFunction("getOffset", 0);
    }

    return SeleniumJavaRobot.__getInfo.apply(SeleniumJavaRobot, arguments);
};

var BUTTONS = {
    16: webdriver.Button.LEFT,
    8: webdriver.Button.MIDDLE,
    4: webdriver.Button.RIGHT
};

module.exports = function(driver, stopPromise, logFunction) {
    var stopped = false;
    stopPromise.then(function() {
        stopped = true;
    });

    var tasksHandlers = {
        mouseMove: function(x, y) {
            return driver.actions().move({
                origin: webdriver.Origin.VIEWPORT,
                x: Math.round(x),
                y: Math.round(y),
                duration: 0
            }).perform();
        },

        smoothMouseMove: function(fromX, fromY, toX, toY, duration) {
            return driver.actions().move({
                origin: webdriver.Origin.VIEWPORT,
                x: Math.round(fromX),
                y: Math.round(fromY),
                duration: 0
            }).move({
                origin: webdriver.Origin.VIEWPORT,
                x: Math.round(toX),
                y: Math.round(toY),
                duration: duration
            }).perform();
        },

        mousePress: function(buttons) {
            return driver.actions().press(BUTTONS[buttons]).perform();
        },

        mouseRelease: function(buttons) {
            return driver.actions().release(BUTTONS[buttons]).perform();
        },

        keyPress: function(javaKey) {
            var key = KEYS_MAP[+javaKey];
            if (!key) {
                return Q.reject("Unsupported key: " + javaKey);
            }
            return driver.actions().keyDown(key).perform();
        },

        keyRelease: function(javaKey) {
            var key = KEYS_MAP[+javaKey];
            if (!key) {
                return Q.reject("Unsupported key: " + javaKey);
            }
            return driver.actions().keyUp(key).perform();
        },

        getOffset: function() {
            return Q({
                x: 0,
                y: 0
            });
        }
    };

    var defaultHandler = function() {
        return Q.reject("Unsupported operation!");
    };

    var executeTask = function(task) {
        logFunction(["debug", "Robot action %s", JSON.stringify(task)]);
        var handler = tasksHandlers[task.name] || defaultHandler;
        return Q(handler.apply(null, task.args)).then(function(result) {
            return {
                success: true,
                result: result
            };
        }).catch(function(error) {
            return {
                success: false,
                result: error + ""
            };
        }).then(function(result) {
            if (stopped) {
                return;
            }
            return driver.executeScript("window.SeleniumJavaRobot.__callback(arguments[0], arguments[1])", task.id, result);
        });
    };

    var waitForTasks = function() {
        if (stopped) {
            return;
        }
        return driver.executeAsyncScript(script).then(function(task) {
            if (stopped) {
                return;
            }
            if (task) {
                return executeTask(task).then(waitForTasks);
            }
            return waitForTasks();
        });
    };

    return waitForTasks();
};
