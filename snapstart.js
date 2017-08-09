#!/usr/bin/env node



var path = require("path");
var os = require('os');

// Load settings 
var SettingsHelper = require("./lib/SettingsHelper.js");
var settingsHelper = new SettingsHelper();

var packagePath = settingsHelper.nodePackagePath;

process.env.NODE_PATH = packagePath;
process.env.HOME = os.userInfo().homedir;

require('app-module-path').addPath(packagePath);
require('module').globalPaths.push(packagePath);

console.log('packagePath %s', packagePath);

require("./start.js");
