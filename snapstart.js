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

var imei;
var interval;
// If user hasn't logged in before we'll try to get the IMEI id
if (settingsHelper.isFirstStart()) {
    var exec = require('child_process').exec;
    var child;
    child = exec("sudo mmcli -m 0|grep -oE \"imei: '(.*)'\"|sed 's/imei: //g'|sed \"s/'//g\"", function (error, stdout, stderr) {
        console.log('imei: ' + stdout);
        if (error !== null) {
            console.log("Unable to get the IMEI id");
            console.log('ERROR: ' + error);
            process.abort();
        }
        else {
            imei = stdout;
            tryLoginUsingICCID();
            interval = setInterval(function () {
                tryLoginUsingICCID();
            }, 10000);
        }
    });
}
else {
    require("./start.js");
}

function tryLoginUsingICCID() {
    var url = require('url');
    var request = require("request");
    var debug = process.execArgv.find(function (e) { return e.startsWith('--debug'); }) !== undefined;

    if (debug)
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

    var hubUri = url.parse(settingsHelper.settings.hubUri);

    var uri = 'https://' + hubUri.host + '/jasper/signInUsingICCID?iccid=' + imei;
    console.log("calling jasper service..." + uri);
    request.post({ url: uri, timeout: 5000 }, function (err, response, body) {
        if (err || response.statusCode !== 200)
            console.log("response: " + response.statusCode);
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
