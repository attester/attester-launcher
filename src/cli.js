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

var minimist = require("minimist");
var yaml = require("js-yaml");
var fs = require("fs");
var log = require("./log");

var merge = require("./util/merge");
var Orchestrator = require("./orchestrator");
var preprocessConfig = require("./preprocessConfig");

var minimistOptions = {
    string: ["server"],
    boolean: ["verbose", "colors", "help", "version"],
    default: {
        colors: process.stdout.isTTY
    }
};

module.exports = function(args) {
    var config = minimist(args, minimistOptions);

    if (config.help) {
        console.log("Usage:\n  attester-launcher [options] <configFiles>\n\nCommon options:\n  --server http://127.0.0.1:7777\n  --verbose\n  --colors\n  --help\n  --version");
        return null;
    }
    delete config.help;

    if (config.version) {
        console.log(require("../package.json").version);
        return null;
    }
    delete config.version;

    log.setVerbose(config.verbose);
    delete config.verbose;

    log.setColors(config.colors);
    delete config.colors;

    var error = false;
    // uses reverse so that the last config file overrides the first one
    // (because merge does not override parameters)
    var configFiles = config._.reverse();
    delete config._;

    configFiles.forEach(function(fileName) {
        var fileContent, fileConfig;
        try {
            fileContent = fs.readFileSync(fileName, "utf8");
            fileConfig = /\.ya?ml$/i.test(fileName) ? yaml.safeLoad(fileContent) : JSON.parse(fileContent);
        } catch (e) {
            log(["error", "While reading %s: %s", fileName, e + ""]);
            error = true;
            return;
        }
        merge(config, fileConfig);
    });
    if (!config.server) {
        config.server = "http://127.0.0.1:7777";
    }
    if (error) {
        return null;
    }
    config.env = process.env; // gives access to the environment
    config = preprocessConfig(config);
    delete config.env; // removes the environment
    try {
        var orchestrator = new Orchestrator();
        orchestrator.on("log", log);
        orchestrator.start(config);
        return orchestrator;
    } catch (e) {
        log(["error", "%s", e + ""]);
    }
    return null;
};
