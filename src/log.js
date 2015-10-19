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
var colors = require('colors'); // this modifies String.prototype

var levels = {
    "debug": {
        colors: [],
        enabled: false
    },
    "info": {
        colors: ["green"],
        enabled: true
    },
    "warn": {
        colors: ["yellow"],
        enabled: true
    },
    "error": {
        colors: ["red", "bold"],
        enabled: true
    }
};

var applyColors = function(msg, colorsArray) {
    colorsArray.forEach(function(color) {
        msg = msg[color];
    });
    return msg;
};

var log = module.exports = function(args) {
    var level = args[0];
    var levelInfo = levels[level];
    if (levelInfo.enabled) {
        var msg = util.format.apply(util.format, args.slice(1));
        msg = "[attester-launcher] ".grey + applyColors(msg, levelInfo.colors);
        console.log(msg);
    }
};

log.setVerbose = function(value) {
    levels.debug.enabled = value;
};

log.setColors = function(value) {
    colors.mode = value ? "console" : "none";
};
