﻿/*
The MIT License (MIT)

Copyright (c) 2014 microServiceBus.com

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
'use strict';
var colors = require('colors');
var signalR = require('./signalR.js');
var moment = require('moment');
var async = require('async');
var extend = require('extend');
var reload = require('require-reload')(require);
var os = require("os");
var fs = require('fs');
var path = require('path');
var util = require('./Utils.js');
var guid = require('uuid');
var pjson = require('../package.json');
var keypress = require('keypress');
var intercept = require("intercept-stdout");

function MicroServiceBusHost(settingsHelper) {
    var self = this;
    
    // Callbacks
    this.onStarted = null;
    this.onStopped = null;
    // Handle settings
    var temporaryVerificationCode;
    var useMacAddress = false;
    var _hasDisconnected = false;
    var _shoutDown = false;
    var _firstStart = true;
    var _restoreTimeout;
    var _heartBeatInterval;
    var _lastHeartBeatReceived = true;
    var signInResponse;
    var memwatch;
    var logStream;
    var rootFolder = process.arch == 'mipsel' ? '/mnt/sda1':__dirname;
    var captured_text = "";
    var microServiceBusNode;
    var existingHostName;
    var _debugMode = false;

    var client = new signalR.client(
        settingsHelper.settings.hubUri + '/signalR',
	    ['integrationHub'],                
        10, //optional: retry timeout in seconds (default: 10)
        true
    );
    
    // Wire up signalR events
    /* istanbul ignore next */
    client.serviceHandlers = {
        bound: function () { log("Connection: " + "bound".yellow); },
        connectFailed: function (error) {
            log("Connection: " + "Connect Failed: ".red );
            
        },
        connected: function (connection) {
            log("Connection: " + "Connected".green);
            microServiceBusNode.settingsHelper = settingsHelper;
            microServiceBusNode.SignIn(existingHostName, temporaryVerificationCode, useMacAddress);
            startHeartBeat();
        },
        disconnected: function () {
            
            log("Connection: " + "Disconnected".yellow);

            clearTimeout(_restoreTimeout);
        },
        onerror: function (error) {
            log("Connection: " + "Error: ".red, error);
            try {
                if (error.endsWith("does not exist for the organization"))
                    self.onStarted(0, 1);
            }
            catch (e) { }
        },
        messageReceived: function (message) {

        },
        bindingError: function (error) {
            log("Connection: " + "Binding Error: ".red, error);
        },
        connectionLost: function (error) {
            //_isWaitingForSignInResponse = false;
            log("Connection: " + "Connection Lost".red);
        },
        reconnected: void function (connection) {
            log("Connection: " + "Reconnected ".green);
        },
        reconnecting: function (retry /* { inital: true/false, count: 0} */) {
            log("Connection: " + "Retrying to connect ".yellow);
            return true;
        }
    };
    
    // Wire up signalR inbound events handlers
    client.on('integrationHub', 'errorMessage', function (message) {
        OnErrorMessage(message);
    });
    client.on('integrationHub', 'ping', function (message) {
        OnPing(message);
    });
    client.on('integrationHub', 'getEndpoints', function (message) {
        OnGetEndpoints(message);
    });
    client.on('integrationHub', 'updateItinerary', function (updatedItinerary) {
        OnUpdateItinerary(updatedItinerary);
    });
    client.on('integrationHub', 'changeState', function (state) {
        OnChangeState(state);
    });
    client.on('integrationHub', 'changeDebug', function (debug) {
        OnChangeDebug(debug);
    });
    client.on('integrationHub', 'changeTracking', function (enableTracking) {
        OnChangeTracking(enableTracking);
    });
    client.on('integrationHub', 'sendMessage', function (message, destination) {
        OnSendMessage(message, destination)
    });
    client.on('integrationHub', 'signInMessage', function (response) {
        OnSignInMessage(response);
    });
    client.on('integrationHub', 'nodeCreated', function (nodeData) {
        OnNodeCreated(nodeData);
    });
    client.on('integrationHub', 'heartBeat', function (id) {
        _lastHeartBeatReceived = true;

    });    
    client.on('integrationHub', 'forceUpdate', function () {
        log("forceUpdate".red);
        restart();
    });  
    client.on('integrationHub', 'restart', function () {
        log("restart".red);
        restart();
    });  
    client.on('integrationHub', 'reboot', function () {
        log("reboot".red);
        reboot();
    });  
    client.on('integrationHub', 'enableDebug', function (debug) {
        OnEnableDebug(debug);
    });
    client.on('integrationHub', 'reportState', function (id) {
        OnReportState(id);
    });

    // Called by HUB if it was ot able to process the request
    function OnErrorMessage(message) {
        console.log('Error: '.red + message.red);
    };
    // Called by HUB when user clicks on the Hosts page
    function OnPing(id) {
        log("ping => " + microServiceBusNode.InboundServices().length + " active service(s)");
        
        client.invoke('integrationHub', 'pingResponse', settingsHelper.settings.nodeName , os.hostname(), "Online", id);
        
    }
    // Called by HUB to receive all active serices
    function OnGetEndpoints(message) {
        console.log('OnGetEndpoints'.blue);
    }
    // Called by HUB when itineraries has been updated
    function OnUpdateItinerary(updatedItinerary) {
        microServiceBusNode.UpdateItinerary(updatedItinerary);

    }
    // Called by HUB when itineraries has been updated
    function OnChangeState(state) {
        microServiceBusNode.ChangeState(state);
    } 
    // Update debug mode
    function OnChangeDebug(debug) {
        microServiceBusNode.SetDebug(debug);
        
    }
    // Enable remote debugging
    function OnEnableDebug(debug) {
        log("CHANGING DEBUG MODE...");
        setTimeout(function () {
            client.end();
            process.send({ cmd: 'DEBUG' });
            log('Restarting for debug'.red);
            setTimeout(function () {
                client = undefined;
                process.exit();
            }, 100);

        }, 1000);
    }
    // Enable remote debugging
    function OnChangeTracking(enableTracking) {
        microServiceBusNode.SetTracking(enableTracking);
    }
    // Incoming message from HUB
    function OnSendMessage(message, destination) {
        console.log('OnSendMessage'.blue);
    }
    // Called by HUB when signin  has been successful
    function OnSignInMessage(response) {
        log('Sign in complete...'.grey);
        response.basePath = __dirname;
        microServiceBusNode.SignInComplete(response);
    }
    // Called by HUB when node has been successfully created    
    /* istanbul ignore next */
    function OnNodeCreated(nodeData) {

        nodeData.machineName = os.hostname();

        settingsHelper.settings = extend(settingsHelper.settings, nodeData);

        log('Successfully created node: ' + nodeData.nodeName.green);

        settingsHelper.save();

        microServiceBusNode.settingsHelper = settingsHelper;
        microServiceBusNode.NodeCreated();

        client.invoke('integrationHub', 'created', nodeData.id, settingsHelper.settings.nodeName, os.hostname(), "Online", nodeData.debug, pjson.version, settingsHelper.settings.organizationId);
    }
    // Called when the hub require state information (network, storage, memory and cpu)
    function OnReportState(id) {
        var network = require('network');
        network.get_active_interface(function (err, network) {

            var state = {
                network: network,
                memory: {
                    totalMem: (os.totalmem() / 1000 / 1000).toFixed(2) + ' Mb',
                    freemem: (os.freemem() / 1000 / 1000).toFixed(2) + ' Mb'
                },
                cpus: os.cpus()
            };

            client.invoke('integrationHub', 'reportStateResponse', state, id);
        })
    }

    function startHeartBeat() {

        if (_heartBeatInterval === null || _heartBeatInterval === undefined) {
            log("Heartbeat started".grey);
            _heartBeatInterval = setInterval(function () {
                var lastHeartBeatId = guid.v1();

                if (!_lastHeartBeatReceived)
                    log("MISSING HEARTBEAT".bgRed.white);

                client.invoke(
                    'integrationHub',
                    'heartBeat',
                    lastHeartBeatId
                );
                _lastHeartBeatReceived = false;
            }, 1 * 30 * 1000);
        }
    }
    
    function log(message) {
        message = message === undefined ? "" : message;
        if (settingsHelper.settings.log && logStream) {
            logStream.write(new Date().toString() + ': ' + colors.strip(message) + '\r\n');
        }

        console.log(message);
    }
        
    var unhook_intercept = intercept(function (message) {
        if (settingsHelper.settings.debug != null && settingsHelper.settings.debug == true && client.isConnected()) {// jshint ignore:line  
            client.invoke( 
                'integrationHub',
		        'logMessage',	
		        settingsHelper.settings.nodeName,
                message,
                settingsHelper.settings.organizationId);
        }
    });
    // this function is called when you want the server to die gracefully
    // i.e. wait for existing connections
    /* istanbul ignore next */
    function gracefulShutdown() {
        log("bye")
        client.invoke('integrationHub', 'signOut', settingsHelper.settings.nodeName, os.hostname(), "Offline");
        log("Received kill signal, shutting down gracefully.");
        log(settingsHelper.settings.nodeName + ' signing out...');
        setTimeout(function () {
            client.end();
            abort();
        }, 100);
        
    }
    function restart() {
        log("bye")
        client.invoke('integrationHub', 'signOut', settingsHelper.settings.nodeName, os.hostname(), "Offline");
        log("Received kill signal, shutting down gracefully.");
        log(settingsHelper.settings.nodeName + ' signing out...');
        setTimeout(function () {
            client.end();
            setTimeout(function () {
                log('Restarting'.red);
                process.exit();
                //process.send({ chat: 'restart' });
            }, 500);
        }, 500);
    }
    function reboot() {
        log("bye")
        client.invoke('integrationHub', 'signOut', settingsHelper.settings.nodeName, os.hostname(), "Offline");
        log("Received kill signal, shutting down gracefully.");
        log(settingsHelper.settings.nodeName + ' signing out...');
        setTimeout(function () {
            client.end();
            setTimeout(function () {
                util.reboot();
            }, 500);
        }, 500);
    }
    function abort() {
        if (_debugMode)
            process.exit();
        else
            process.send({ cmd: 'abort' });
    }

    MicroServiceBusHost.prototype.Start = function (testFlag) {
        
        if (testFlag) {
            _debugMode = true;
        }
        else {
            // listen for TERM signal .e.g. kill 
            process.on('SIGTERM', function (x) {
                gracefulShutdown();
            });

            // listen for INT signal e.g. Ctrl-C
            process.on('SIGINT', function (x) {
                gracefulShutdown();
            });

            process.on('uncaughtException', function (err) {
                /* istanbul ignore next */
                if (err.errno === 'EADDRINUSE' || err.errno === 'EACCES') {
                    log("");
                    log("Error: ".red + "The address is in use. Either close the program is using the same port, or change the port of the node in the portal.".yellow);
                }
                else if (err.message == 'gracefulShutdown is not defined') {
                    gracefulShutdown();
                }
                else if (err.message == 'Error: channel closed') {
                    gracefulShutdown();
                }
                else
                    log('Uncaught exception: '.red + err);
            });
        }
        
        var args = process.argv.slice(2);

        if (settingsHelper.settings.log) {
            logStream = fs.createWriteStream(settingsHelper.settings.log);
        }

        // Log in using settings
        if (settingsHelper.settings.hubUri != null && settingsHelper.settings.nodeName != null && settingsHelper.settings.organizationId != null) { // jshint ignore:line
            if (args.length > 0 && (args[0] == '/n' || args[0] == '-n')) {
                settingsHelper.settings.nodeName = args[1];
            }
            log('Logging in using settings'.grey);
        }
        // First login
        else if (args.length > 0) {
            switch (args[0]) {
                case '-w':
                case '/w':
                    useMacAddress = true;
                    break;
                case '/c':
                case '-c':
                case '-code':
                case '/code':
                    temporaryVerificationCode = args[1];

                    if (args[2] != null && args[3] != null && // jshint ignore:line
                        (args[2] == '/n' ||
                            args[2] == '-n' ||
                            args[2] == '/node' ||
                            args[2] == '-node'))
                        existingHostName = args[3];

                    break;
                default: {
                    log('Sorry, invalid arguments.'.red);
                    log('To start the host using temporary verification code, use the /code paramenter.'.yellow);
                    log('Eg: node start.js -c ABCD1234'.yellow);
                    log('');
                    log('You can also specify the node:'.yellow);
                    log('Eg: node start.js -c ABCD1234 -n nodejs00001'.yellow);
                    log('');
                    log("If you've installed the package globaly you can simplify by typing:".yellow);
                    log('Eg: nodestart -c ABCD1234 -n nodejs00001'.yellow);
                    log('');
                    self.onStarted(0, 1);
                    abort();
                    return;
                }
            }
        }
        /* istanbul ignore if */
        else {// Wrong config
            /* istanbul ignore if */
            if (temporaryVerificationCode != null) { // jshint ignore:line

            }
            else {
                if (process.argv.length != 4) {
                    log('');
                    log('Missing arguments'.red);
                    log('Make sure to start using arguments; verification code (/c) and optionally host name.'.yellow);
                    log(' If you leave out the host name, a new host will be generated for you'.yellow);
                    log('node start.js /c <Verification code> [/n <Node name>]'.yellow);
                    log('Eg: node start.js /c V5VUYFSY [/n MyHostName]'.yellow);
                    self.onStarted(0, 1);
                    abort();
                    return;
                }

                settingsHelper.settings.nodeName = process.argv[3];
                settingsHelper.settings.organizationId = process.argv[2];
                settingsHelper.settings.machineName = os.hostname();

                if (settingsHelper.settings.debug == null) // jshint ignore:line
                    settingsHelper.settings.debug = false;


                if (settingsHelper.settings.hubUri == null) // jshint ignore:line
                    settingsHelper.settings.hubUri = "wss://microservicebus.com";

                settingsHelper.save();

                var nodeName = settingsHelper.settings.nodeName != undefined ? settingsHelper.settings.nodeName : "";
                var hubUri = settingsHelper.settings.hubUri != undefined ? settingsHelper.settings.hubUri : "";

                log('Node:           ' + nodeName.grey);
                log('Hub:            ' + hubUri.grey);
                log('');
            }
        }
        
        if (typeof String.prototype.startsWith != 'function') {
            // see below for better implementation!
            String.prototype.startsWith = function (str) {
                return this.indexOf(str) === 0;
            };
        }
        // Only used for localhost
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

        // Load microservicebus-core
        try {
            
            //var module = require('module');

            //for (var i = 0; i < require.main.paths.length; i++) {
                
            //    if (!module.globalPaths.find(function (a) { return a === require.main.paths[i] })) {
            //        module.globalPaths.push(require.main.paths[i]);
            //        console.log("NPM directory added" + require.main.paths[i]);
            //    }
            //}
            
            //console.log('Loaded NPM Paths (require.main.paths)'.bgGreen.white);
            //for (var i = 0; i < require.main.paths.length; i++) {
            //    console.log(require.main.paths[i]);
            //}
            
            //console.log('Loaded NPM Paths (globalPaths)'.bgGreen.white);
            //for (var i = 0; i < module.globalPaths.length; i++) {
            //    console.log(module.globalPaths[i]);
            //}
            
            var MicroServiceBusNode = require("microservicebus-core");
        }
        catch (e)
        {
            console.log("Unnable to load microservicebus-core".red);
            console.log(e);
            return;
        }
        microServiceBusNode = new MicroServiceBusNode(settingsHelper);
        microServiceBusNode.nodeVersion = pjson.version;
        microServiceBusNode.OnStarted(function (loadedCount, exceptionCount) {
            self.onStarted(loadedCount, exceptionCount);
        });
        microServiceBusNode.OnStopped(function () {

        });
        microServiceBusNode.OnSignedIn(function (hostData) {
            hostData.npmVersion = pjson.version
            log('Signing in...'.grey);
            client.invoke(
                'integrationHub',
                'SignIn',
                hostData
            );
        });
        microServiceBusNode.OnPingResponse(function () {
            client.invoke(
                'integrationHub',
                'signedIn',
                settingsHelper.settings.nodeName,
                os.hostname(),
                "Online",
                settingsHelper.settings.organizationId);
        });
        microServiceBusNode.OnLog(function (message) {
            log(message);
        });
        microServiceBusNode.OnCreateNode(function (temporaryVerificationCode, hostPrefix, existingHostName) {
            log('Create node...'.grey);
            client.invoke(
                'integrationHub',
                'createNode',
                temporaryVerificationCode,
                hostPrefix,
                existingHostName
            );
        });
        microServiceBusNode.OnCreateNodeFromMacAddress(function (macAddress) {
            client.invoke(
                'integrationHub',
                'createNodeFromMacAddress',
                macAddress
            );
        });
        microServiceBusNode.OnUpdatedItineraryComplete(function () {

        });
        microServiceBusNode.OnAction(function (message) {
            log('Action received: '.grey + message.action);
            switch (message.action) {
                case "restart":
                    log("restart".red);
                    restart();
                    return;
                case "reboot":
                    log("reboot".red);
                    reboot();
                    return;
                default:
                    log("Unsupported action");
                    break;
            }
        });
        microServiceBusNode.OnReportLocation(function (location) {
            log('Reporting location...');
            client.invoke(
                'integrationHub',
                'location',
                location
            );
        });
        client.start();
        
        // Startig using proper config
        if (settingsHelper.settings.nodeName != null && settingsHelper.settings.organizationId != null) {
            if (temporaryVerificationCode != null)
                log('Settings has already set. Temporary verification code will be ignored.'.gray);
            
            settingsHelper.settings.machineName = os.hostname();
            settingsHelper.save();
            
            log('');
            log('Node: ' + settingsHelper.settings.nodeName.gray);
            log('Hub:  ' + settingsHelper.settings.hubUri.gray);
            log('');
        }
    };
    MicroServiceBusHost.prototype.OnStarted = function (callback) {
        this.onStarted = callback;
    };
    MicroServiceBusHost.prototype.OnStopped = function (callback) {
        this.onStopped = callback;
    };
    MicroServiceBusHost.prototype.OnUpdatedItineraryComplete = function (callback) {
        this.onUpdatedItineraryComplete = callback;
    };
    
    // Test methods
    MicroServiceBusHost.prototype.TestOnPing = function (message) {
        try {
            OnPing(message);
        }
        catch (ex) {
            return false;
        }
        return true;
    }
    MicroServiceBusHost.prototype.TestOnChangeDebug = function (debug) {
        try {
            OnChangeDebug(debug);
        }
        catch (ex) {
            return false;
        }
        return true;
    }
    MicroServiceBusHost.prototype.TestOnUpdateItinerary = function (updatedItinerary) {
        try {
            OnUpdateItinerary(updatedItinerary);
        }
        catch (ex) {
            return false;
        }
        return true;
    }
    MicroServiceBusHost.prototype.TestOnChangeState = function (state) {
        OnChangeState(state);
        return true;
    }
}

module.exports = MicroServiceBusHost; 
