#!/usr/bin/env node

var path = require("path");
var os = require('os');
var interval;
var _imeiInterval;

var debug = process.execArgv.find(function (e) { return e.startsWith('--debug'); }) !== undefined;

// Load settings 
var SettingsHelper = require("./lib/SettingsHelper.js");
var settingsHelper = new SettingsHelper();

if (!debug) {
    var packagePath = settingsHelper.nodePackagePath;

    process.env.NODE_PATH = packagePath;
    process.env.HOME = os.userInfo().homedir;

    require('app-module-path').addPath(packagePath);
    require('module').globalPaths.push(packagePath);
}

// If user hasn't logged in before we'll try to get the IMEI id
if (settingsHelper.isFirstStart()) {

    //if (debug) {
    //    imei = "014752000022947";
    //    tryLoginUsingICCID();
    //    return;
    //}

    var exec = require('child_process').exec;

    setInterval(function () {
        tryGetIMEI(function (imei) {
            if (!imei){
                console.error("STARTSNAP: Unable to get IMEI");
                return;
            }
            else {
                console.log("STARTSNAP: Found IMEI: %s", imei);
                clearInterval(_imeiInterval);
                tryLoginUsingICCID();
                interval = setInterval(function () {
                    tryLoginUsingICCID(imei);
                }, 6000);
            }
        })
    }, 4000);


    //var child;
    //child = exec("sudo mmcli -m 0|grep -oE \"imei: '(.*)'\"|sed 's/imei: //g'|sed \"s/'//g\"", function (error, stdout, stderr) {
    //    console.log('imei: ' + stdout);
    //    if (error !== null) {
    //        console.log("Unable to get the IMEI id");
    //        console.log('ERROR: ' + error);
    //        process.abort();
    //    }
    //    else {
    //        imei = stdout;
    //        tryLoginUsingICCID();
    //        interval = setInterval(function () {
    //            tryLoginUsingICCID();
    //        }, 10000);
    //    }
    //});
}
else {
    require("./start.js");
}

function tryGetIMEI(callback) {
    exec("sudo mmcli -m 0|grep -oE \"imei: '(.*)'\"|sed 's/imei: //g'|sed \"s/'//g\"", function (error, stdout, stderr) {
        console.log('STARTSNAP: imei: ' + stdout);
        if (error !== null) {
            console.log("STARTSNAP: Unable to get the IMEI id");
            console.log('STARTSNAP: ERROR: ' + error);
            callback(error, null);
        }
        else {
            imei = stdout;
            if (!imei)
                callback(null);
            else
                callback(imei);
        }
    });
}
function tryLoginUsingICCID(imei) {
    var url = require('url');
    var request = require("request");
    

    if (debug)
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

    var hubUri = url.parse(settingsHelper.settings.hubUri);

    var uri = 'https://' + hubUri.host + '/jasper/signInUsingICCID?iccid=' + imei;
    console.log("STARTSNAP: calling jasper service..." + uri);
    request.post({ url: uri, timeout: 5000 }, function (err, response, body) {
        if (err)
            console.error("STARTSNAP: ERROR: error: " + err);
        else if (response.statusCode !== 200)
            console.error("STARTSNAP: FAILED: response: " + response.statusCode);
        else {
            console.log("STARTSNAP: Got settings from microServiceBus.com. All good...");
            clearInterval(interval);
            var settings = JSON.parse(body);
            settingsHelper.settings.id = settings.id;
            settingsHelper.settings.nodeName = settings.nodeName;
            settingsHelper.settings.organizationId = settings.organizationId;
            settingsHelper.settings.sas = settings.sas;
            settingsHelper.save();
            require("./start.js");
        }
    })
}
