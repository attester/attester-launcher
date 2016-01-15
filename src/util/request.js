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
var http = require("http");
var url = require("url");

module.exports = function(options) {
    return Q.Promise(function(resolve, reject) {
        var requestOptions = url.parse(options.url);
        requestOptions.method = options.method || "GET";
        var body = options.body;
        var json = options.json;
        if (json) {
            body = JSON.stringify(body || null);
        }
        var req = http.request(requestOptions, function(res) {
            res.setEncoding('utf8');
            var data = "";
            res.on('data', function(chunk) {
                data += chunk;
            });
            res.on('end', function() {
                var statusCode = res.statusCode;
                var success = (statusCode >= 200 && statusCode < 300) || statusCode === 304;
                if (!success) {
                    var error = new Error("HTTP " + statusCode + ": " + (data.trim() || res.statusMessage));
                    error.status = statusCode;
                    error.statusMessage = res.statusMessage;
                    error.data = data;
                    reject(error);
                    return;
                }
                if (json) {
                    try {
                        data = JSON.parse(data);
                    } catch (e) {
                        reject(e);
                    }
                }
                resolve(data);
            });
        });
        req.on('error', reject);
        if (body) {
            req.write(body);
        }
        req.end();
    });
};
