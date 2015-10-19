/*
 * Copyright 2012 Amadeus s.a.s.
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

var toString = Object.prototype.toString;

var isPlainObject = function(obj) {
    return obj ? toString.call(obj) === '[object Object]' : false;
};

var merge = function(dst, src) {
    Object.keys(src).forEach(function(key) {
        var srcValue = src[key];
        var dstValue = dst[key];
        if (dstValue === undefined) {
            if (isPlainObject(srcValue)) {
                dst[key] = merge({}, srcValue);
            } else {
                dst[key] = srcValue;
            }
        } else if (isPlainObject(dstValue)) {
            if (isPlainObject(srcValue)) {
                merge(dstValue, srcValue);
            }
        }
    });
    return dst;
};

module.exports = merge;
