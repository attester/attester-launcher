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

module.exports = function(page, puppeteerKeyboardPath) {
    var puppeteerKeys = require(puppeteerKeyboardPath);
    var keys = {
        Right: {
            code: "ArrowRight"
        },
        Left: {
            code: "ArrowLeft"
        },
        Up: {
            code: "ArrowUp"
        },
        Down: {
            code: "ArrowDown"
        }
    };
    Object.keys(puppeteerKeys).forEach(function(keyName) {
        keys[keyName] = {
            code: puppeteerKeys[keyName].code
        };
    });
    var fnMap = {
        mousemove: function(x, y) {
            return page.mouse.move(x, y);
        },
        mousedown: function(x, y, button) {
            return page.mouse.down({
                button: button
            });
        },
        mouseup: function(x, y, button) {
            return page.mouse.up({
                button: button
            });
        },
        keydown: function(key) {
            key = key.code || key;
            return page.keyboard.down(key);
        },
        keyup: function(key) {
            key = key.code || key;
            return page.keyboard.up(key);
        }
    };
    page.exposeFunction("__callRobot", function(args) {
        var fnName = args[0];
        args.shift();
        if (fnMap.hasOwnProperty(fnName)) {
            return fnMap[fnName].apply(null, args);
        }
    });
    page.evaluateOnNewDocument(function(keys) {
        /* globals window: false */
        if (window.__callRobot) {
            window.phantomJSRobot = {
                keys: keys,
                sendEvent: function() {
                    window.__callRobot([].slice.call(arguments, 0));
                }
            };
        }
    }, keys);
};
