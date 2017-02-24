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

var recurse = require("./util/recurse");

// Match '<%= FOO %>' where FOO is a propString, eg. foo or foo.bar but not
// a method call like foo() or foo.bar().
var propStringTmplRe = /<%=\s*([a-z0-9_$]+(?:\.[a-z0-9_$]+)*)\s*%>/gi;

/**
 * Get the value of a configuration parameter that might use templates
 * @param {String} value Configuration value
 * @param {Object} configData Container object
 * @return {String} String with replacements
 */
function replace(value, configData) {
    if (typeof value != "string") {
        return value;
    } else {
        return value.replace(propStringTmplRe, function(match, path) {
            var value = get(configData, path);
            if (!(value instanceof Error)) {
                return value;
            } else {
                return match;
            }
        });
    }
}

// Keep a map of what I'm currently trying to get. Avoids circular references
var memoGet = {};

/**
 * Get the value of a json object at a given path
 * @param {Object} object Container object
 * @param {String} path Path, delimited by dots
 * @return {Object} value
 */

function get(object, path) {
    if (memoGet[path]) {
        return new Error("circular reference for " + path);
    }
    var parts = path.split(".");
    var obj = object;

    while (typeof obj === "object" && obj && parts.length) {
        var part = parts.shift();
        if (!(part in obj)) {
            return new Error("invalid path");
        }
        obj = obj[part];
    }
    memoGet[path] = true;
    // The replace can cause a circular reference
    var value = replace(obj, object);
    delete memoGet[path];
    return value;
}

module.exports = function(config) {
    return recurse(config, function(value) {
        return replace(value, config);
    });
};
