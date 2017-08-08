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
var fs = require('fs');
var path = require("path");
var util = require("./Utils.js");
var os = require('os');
require('colors');

function SettingsHelper() {

    let snapuserPath = process.env["SNAP_USER_COMMON"];
    this.isRunningAsSnap = snapuserPath != null;

    this.homeDirectory = this.isRunningAsSnap ? snapuserPath : path.resolve(os.userInfo().homedir, 'microServiceBus');

    this.certDirectory = path.resolve(this.homeDirectory, "cert");
    this.persistDirectory = path.resolve(this.homeDirectory, "persist");
    this.serviceDirectory = path.resolve(this.homeDirectory, "services");
    this.settingsFilePath = path.resolve(this.homeDirectory, "settings.json");
    this.settings = {};

    let agentHost = this.isRunningAsSnap ? "Snap".green : "Node.js".green;
    console.log('Agent host: ' + agentHost);
    this.load();
}

SettingsHelper.prototype.save = function () {
    if (!fs.existsSync(this.homeDirectory)) {
        fs.mkdirSync(this.homeDirectory);
    }
    if (!fs.existsSync(this.certDirectory)) {
        fs.mkdirSync(this.certDirectory);
    }
    if (!fs.existsSync(this.persistDirectory)) {
        fs.mkdirSync(this.persistDirectory);
    }
    if (!fs.existsSync(this.serviceDirectory)) {
        fs.mkdirSync(this.serviceDirectory);
    }
    if (!fs.existsSync(this.settingsFilePath)) {
        this.settings = {
            "debug": false,
            "hubUri": "wss://microservicebus.com",
            "useEncryption": false
        }
    }
    var json = JSON.stringify(this.settings, null, 4);
    fs.writeFileSync(this.settingsFilePath, json);
}
SettingsHelper.prototype.load = function () {
    if (!fs.existsSync(this.homeDirectory)) {
        fs.mkdirSync(this.homeDirectory);
    }
    if (!fs.existsSync(this.certDirectory)) {
        fs.mkdirSync(this.certDirectory);
    }
    if (!fs.existsSync(this.persistDirectory)) {
        fs.mkdirSync(this.persistDirectory);
    }
    if (!fs.existsSync(this.serviceDirectory)) {
        fs.mkdirSync(this.serviceDirectory);
    }
    if (!fs.existsSync(this.settingsFilePath)) {
        try {
            this.settings = {
                "debug": false,
                "hubUri": "wss://microservicebus.com",
                "useEncryption": false
            }
            this.save();
        }
        else{

        }
    }
    else {
        var data = fs.readFileSync(this.settingsFilePath);
        this.settings = JSON.parse(data);
    }
}

module.exports = SettingsHelper;