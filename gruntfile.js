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

module.exports = function(grunt) {
    grunt.initConfig({
        jshint: {
            sources: ['package.json', '*.js', 'src/**/*.js'],
            options: {
                node: true,
                debug: true,
                unused: true,
                undef: true,
                eqnull: true,
                "-W079": true,
                "-W069": true
            },
            tests: {
                options: {
                    globals: {
                        describe: false,
                        it: false,
                        before: false,
                        after: false,
                        beforeEach: false,
                        afterEach: false
                    },
                    expr: true
                },
                files: {
                    src: ['test/**/*.js']
                }
            }
        },
        jsbeautifier: {
            update: {
                src: ['<%= jshint.sources %>', '<%= jshint.tests.files.src %>']
            },
            check: {
                src: ['<%= jshint.sources %>', '<%= jshint.tests.files.src %>'],
                options: {
                    mode: "VERIFY_ONLY"
                }
            }
        },
        exec: {
            mocha: {
                command: function() {
                    var args = [process.argv[0], require.resolve("mocha/bin/mocha")];
                    var grep = grunt.option("grep");
                    if (grep) {
                        args.push("--grep", grep);
                    }
                    return '"' + args.join('" "') + '"';
                }
            }
        }
    });

    grunt.loadNpmTasks('grunt-jsbeautifier');
    grunt.loadNpmTasks('grunt-contrib-jshint');
    grunt.loadNpmTasks('grunt-exec');
    grunt.registerTask('test', ['jsbeautifier:check', 'jshint', 'mocha']);
    grunt.registerTask('mocha', ['exec:mocha']);
    grunt.registerTask('beautify', ['jsbeautifier:update']);
    grunt.registerTask('default', ['test']);
};
