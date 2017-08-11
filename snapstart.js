#!/usr/bin/env node

var path = require("path");
var os = require('os');
var interval;
// Load settings 
var SettingsHelper = require("./lib/SettingsHelper.js");
var settingsHelper = new SettingsHelper();
var packagePath = settingsHelper.nodePackagePath;

process.env.NODE_PATH = packagePath;
process.env.HOME = os.userInfo().homedir;

require('app-module-path').addPath(packagePath);
require('module').globalPaths.push(packagePath);

if (settingsHelper.isFirstStart()) {

    tryLoginUsingICCID();

    var interval = setInterval(function () {
        tryLoginUsingICCID();
    }, 10000);
}
else {
    start();
}

function tryLoginUsingICCID() {
    var url = require('url');
    var request = require("request");
    var debug = process.execArgv.find(function (e) { return e.startsWith('--debug'); }) !== undefined;

    //if (debug)
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

    var hubUri = url.parse(settingsHelper.settings.hubUri);

    var uri = 'https://' + hubUri.host + '/jasper/signInUsingICCID?iccid=' + '89462046051003086621';
    console.log("calling jasper service...");
    request.post({ url: uri, timeout: 3000 }, function (err, response, body) {
        if (err || response.statusCode !== 200)
            console.log("timeout");
        else {
            var settings = JSON.parse(body);
            clearInterval(interval);
            settingsHelper.settings.id = settings.id;
            settingsHelper.settings.nodeName = settings.nodeName;
            settingsHelper.settings.organizationId = settings.organizationId;
            settingsHelper.settings.sas = settings.sas;
            settingsHelper.save();
            require("./start.js");
        }
    })
}
