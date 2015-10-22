# attester-launcher

[![Build Status](https://secure.travis-ci.org/attester/attester-launcher.png)](https://travis-ci.org/attester/attester-launcher)
[![Dependencies](https://david-dm.org/attester/attester-launcher.svg?style=flat)](https://david-dm.org/attester/attester-launcher)
[![devDependencies](https://david-dm.org/attester/attester-launcher/dev-status.svg?style=flat)](https://david-dm.org/attester/attester-launcher#info=devDependencies)

[![npm](https://nodei.co/npm/attester-launcher.png?compact=true)](https://www.npmjs.com/package/attester-launcher)

*attester-launcher* is a command line tool to automatically start and stop browsers for an [attester](https://github.com/attester/attester) campaign.

*attester-launcher* only works with [attester](https://github.com/attester/attester) version 2.4 and later.

## Usage

*attester-launcher* is already included in [attester](https://github.com/attester/attester). Once *attester* is installed, *attester-launcher* can be used directly from *attester* with the `--launcher-config` option, by specifying the configuration file to use. For example:

``
attester myCampaignConfig.yml --launcher-config launcherConfig.yml
``

*attester-launcher* can also be started separately to connect to an already running attester server. To use it that way, it is needed to install it from the [npm repository](https://npmjs.org/package/attester):

``
npm install -g attester-launcher
``

Then it can be started with:

``
attester-launcher launcherConfig.yml --server http://127.0.0.1:7777
``

It is possible to specify multiple configuration files. In that case, configurations are merged, and values from the last configuration files specified in the command line can override values from previous configuration files.

Parameters from the configuration file can be overridden in the command line, for example: `--server http://127.0.0.1:7777`, or `--maxInstances.Browser_Firefox 0`.

## Configuration file format

*attester-launcher* expects one or more configuration files, which specify which browsers to start and how.

Configuration files can be either in the [JSON](http://json.org/) or the [YAML](http://yaml.org/) format.
The format of a configuration file is recognized by the extension of the file. If it is `.yml` or `.yaml`, the file is parsed with the YAML parser, otherwise it is parsed with the JSON one.

For the value of any configuration parameter, it is possible to use the `<%= env.ENVIRONMENT_VARIABLE_NAME %>` syntax to include the value of an environment variable. It is also possible to refer to any other configuration value, for example: `<%= maxInstances.Browser_Firefox %>` or `<%= server %>`.

Here is a sample configuration file, in the YAML format:

```yaml
# The launchers section defines named launchers, which can be used in the browsers section.
# It is mostly useful to define common properties for multiple browsers.
launchers:
    MySauceLabsConfig:
        # Launchers can inherit from one another.
        # The parent launcher is defined in the $launcher property.
        # The names of built-in launchers start with a $ (such as $saucelabs).
        # Properties prefixed with a $ are generic properties (no matter which launcher is used).
        # Properties without the $ prefix are processed by the specified launcher.
        $launcher: '$saucelabs'
        $connectingTimeout: 300000
        $maxInstances: 5
        capabilities:
            tunnelIdentifier: <%= env.TRAVIS_JOB_NUMBER %>
            recordVideo: false
# The browsers section defines how to start each browser defined in the campaign configuration.
# Each key in the map (here: IE, Firefox, Chrome and PhantomJS), must match the name of a browser
# in the campaign configuration (otherwise, it will be ignored).
browsers:
    IE:
        # This configuration extends MySauceLabsConfig, which is defined in the launchers section
        $launcher: 'MySauceLabsConfig'
        capabilities:
            browserName: internet explorer
            platform: Windows 7
            version: 11.0
    Firefox:
        # 2 different configurations for Firefox: a remote one from SauceLabs and a local one
        # with $webdriver:
        - $launcher: 'MySauceLabsConfig'
          capabilities:
              browserName: firefox
              platform: Linux
        - $launcher: '$webdriver'
          $tags:
              - LocalBrowser
          capabilities:
              browserName: firefox
    Chrome:
        - $launcher: 'MySauceLabsConfig'
          capabilities:
              browserName: chrome
              platform: Linux
        - $launcher: '$webdriver'
          $tags:
              - LocalBrowser
          capabilities:
              browserName: chrome
    PhantomJS:
        $launcher: '$phantomjs'
        $maxInstances: 8
maxInstances:
    Launcher_MySauceLabsConfig: 5
    Browser_Firefox: 5
    Tag_LocalBrowser: 1
```

## Global properties

* `server` Address of the *attester* server to connect to. Defaults to `http://127.0.0.1:7777`. If *attester-launcher* is started from *attester*, this value is automatically set by *attester* in the command line (which overrides any value defined in a configuration file).

* `launchers` Map defining named launchers with their configuration. Each key in the map is the name of a launcher which can then be used as the value of the `$launcher` property of a launcher configuration. Each value in the map is a launcher configuration, as described in the [Launchers properties section](#launchers-properties).

* `browsers` Map defining which launchers to use for each browser defined in the attester campaign. Each key in the map must match the name of a browser in the campaign configuration (otherwise, it will be ignored). Each value in the map is either a launcher configuration, or an array of launcher configurations.

* `minTasksPerBrowser` Minimum number of tasks per browser instance. It is used as a limit to never start more browsers than the number of remaining tasks divided by this number. It is used at the time new browser instances are started, it is not used to stop already started browser instances.

* `maxInstances` Map defining the maximum number of concurrent browser instances for different kinds of browsers. Each value in the map is a number. Each key in the map is a string which must use one of the following prefix:

    * `Launcher_`: each key prefixed with `Launcher_` defines the maximum number of concurrent browser instances for the corresponding launcher name (that launcher name should be a built-in launcher or should correspond to a key inside the `launchers` map). All descendant launchers are included in the count.

    * `Browser_`: each key prefixed with `Browser_` defines the maximum number of concurrent browser instances for the corresponding browser name (that browser name should correspond to a key inside the `browsers` map, and the name of a browser in the campaign configuration).

    * `Tag_`: each key prefixed with `Tag_` defines the maximum number of concurrent browser instances for launchers whose configuration contains the corresponding tag in the `$tags` property.

    * `Any`: the `Any` key defines the total maximum number of concurrent browser instances.

## Launchers properties

Launchers can be configured through different properties. Properties prefixed with a `$` are generic properties, common to all launchers. Properties without the `$` prefix are processed by the specified launcher.

### Common properties

* `$launcher` Name of a parent launcher to inherit from. It can be either a built-in launcher or a launcher defined in the `launchers` map.

* `$tags` Array of tags. Each tag is a string, which creates an independent counter of browser instances which can be used in the `maxInstances` map documented in the previous section.

* `$maxInstances` Maximum number of concurrent browser instances which can be started by this launcher. Defaults to 1. Note that this property does not include descendant launchers in the count. For example, if `MySauceLabsConfig` is defined in the `launchers` section with its `$maxInstances` property set to 5, and if the `Firefox` and `Chrome` browsers both inherit from `MySauceLabsConfig`, then the 5 instances of Firefox are counted independently of the 5 instances of Chrome, so there can be a total of 10 instances of `MySauceLabsConfig` if we count all descendant launchers. To limit the total number of descendants of a named launcher, it is possible to use the general `maxInstances` map documented at the previous section, with its `Launcher_` prefix (but not this `$maxInstances` launcher property).

* `$connectionRetries` Specifies the maximum number of times a launcher is allowed to fail connecting its browser to the *attester* server. Defaults to 3. Once this threshold is reached, the launcher is disabled. As for the `$maxInstances` property, the number of failures is counted independently in each launcher, not taking into account descendant launchers.

* `$connectingTimeout` Specifies the maximum number of milliseconds to wait between the time a launcher is started and the time the browser successfully connects to the *attester* server. Defaults to 120000 ms (2 min). When this timeout is reached, the browser is closed.

* `$disconnectedTimeout` Specifies the maximum number of milliseconds to wait between the time a launcher is disconnected and the time it reconnects. Defaults to 100 ms. When this timeout is reached, the browser is closed. When a browser is disconnected, there is usually not much hope that it will reconnect, which explains why the default value is so low, but there are some use cases in which it can be interesting to define a higher value.

* `$idleTimeout` Specifies the maximum number of milliseconds to wait between the time a browser is idle and the time it gets more tasks to execute. Defaults to 100 ms. When this timeout is reached, the browser is closed. When a browser is idle, there is usually not much hope that it will get more tasks to execute, which explains why the default value is so low. However, it can happens in case another browser of the same type gets disconnected while executing a task and if attester is configured to restart tasks when browsers are disconnected.

* `$exitingTimeout` Specifies the maximum number of milliseconds to wait between the time a browser is asked to close and the time it is reported by the launcher as closed. Defaults to 10000 ms (10s). When this timeout is reached, the browser is considered as closed even if the launcher did not report it, and the instances counters are updated so that it is possible to start another browser if needed.

### $process

The `$process` launcher allows to start a browser by executing a process specified in the `command` property.
The URL the browser should connect to is appended at the end of the arguments specified in `commandArgs`.
The process is killed when the browser should stop.
Note that, on Windows, as stated in the [Node.js documentation](https://nodejs.org/api/process.html#process_signal_events), killing the process means terminating it without notification.

* `command` Path to the executable file to start.

* `commandArgs` Array of string arguments to pass to the executable. Defaults to an empty array. The URL the browser should connect to is appended as the last parameter.

### $phantomjs

The `$phantomjs` launcher allows to easily start [PhantomJS](http://phantomjs.org/), with a control script adapted to *attester*. It internally relies on the `$process` launcher to start *PhantomJS*.

* `phantomjsPath` Path to the phantomjs executable. Defaults to the value of the `PHANTOMJS_PATH` environment variable if it is available, or the `"phantomjs"` string otherwise (which means phantomjs should be in the path).

* `phantomjsArgs` Array of string arguments to pass to the phantomjs executable. Defaults to an empty array.

* `scriptArgs` Arguments to the phantomjs control script. Defaults to an empty array.

### $webdriver

The `$webdriver` launcher allows to start a browser with [Selenium WebDriver](http://selenium.googlecode.com/git/docs/api/javascript/index.html).

* `server` Selenium server to connect to. By default, no server is used, and local browsers are used.

* `capabilities` Map of desired capabilities. You can refer to [the documentation](https://code.google.com/p/selenium/wiki/DesiredCapabilities)

* `keepAliveDelay` Interval (in milliseconds) at which a keep-alive command is sent. Defaults to -1, which disables the keep-alive feature. The command used to keep the browser alive is `getCurrentUrl`.

### $saucelabs

The `$saucelabs` launcher allows to start a browser on the [Sauce Labs platform](https://saucelabs.com/). It internally relies on the `$webdriver` launcher.

* `username` Sauce Labs user name to use to start a browser through the WebDriver API. Defaults to the value of the `SAUCE_USERNAME` environment variable.

* `accessKey` Sauce Labs access key, associated to the previous `username` parameter. Defaults to the value of the `SAUCE_ACCESS_KEY` environment variable.

* `server` Selenium server to connect to. Defaults to the value of the `SAUCE_SELENIUM_SERVER` environment variable, or `http://ondemand.saucelabs.com/wd/hub` otherwise.

* `capabilities` Map of desired capabilities. In addition to [standard capabilities supported by Selenium](https://code.google.com/p/selenium/wiki/DesiredCapabilities), Sauce Labs supports passing [additional settings](https://docs.saucelabs.com/reference/test-configuration/). Especially, when using a Sauce Connect tunnel, it can be useful to pass `tunnelIdentifier` and `parentTunnel`.

* `keepAliveDelay` Interval (in milliseconds) at which a keep-alive command is sent. Defaults to -1, which disables the keep-alive feature. The command used to keep the browser alive is `getCurrentUrl`.

### $virtualbox

The `$virtualbox` launcher allows to use a web browser from a [Virtual Box](https://www.virtualbox.org/) virtual machine. The configured virtual machine is cloned from the specified snapshot. The clone is then started and executes the specified command. When tests are finished, the virtual machine is powered off and deleted.

This launcher requires Virtual Box 5.0 or later.

* `vboxInstallPath` Path to the directory containing Virtual Box. The directory should contain the `VBoxManage` executable file. If this parameter is not specified, the value from the `VBOX_INSTALL_PATH` or the `VBOX_MSI_INSTALL_PATH` environment variable is used.

* `vm` Name of the virtual machine to use. The virtual machine will be cloned before being started, so that it is possible to start multiple instances of the same virtual machine.

* `snapshot` Name of the snapshot to use when cloning the virtual machine.

* `command` Command to use inside the virtual machine to start the browser.

* `commandArgs` Arguments to pass to the command. The URL the browser should connect to is appended as the last parameter.

* `username` Name of user to use inside the virtual machine to start the command.

* `password` Password to use inside the virtual machine.

## License

[Apache License 2.0](https://github.com/attester/attester-launcher/blob/master/LICENSE)
