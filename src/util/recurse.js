/*
 * Copyright 2017 Amadeus s.a.s.
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

/**
 * Recurse through objects and arrays executing a function for each non object.
 * The return value replaces the original value
 * @param {Object} value Object on which to recur
 * @param {Function} fn Callback function
 */
var recurse = module.exports = function(value, fn) {
    if (Object.prototype.toString.call(value) === "[object Array]") {
        return value.map(function(value) {
            return recurse(value, fn);
        });
    } else if (Object.prototype.toString.call(value) === "[object Object]") {
        var obj = {};
        Object.keys(value).forEach(function(key) {
            obj[key] = recurse(value[key], fn);
        });
        return obj;
    } else {
        return fn(value);
    }
};
