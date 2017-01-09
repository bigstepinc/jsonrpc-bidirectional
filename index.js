const objExports = {};

objExports.Client = require("./src/Client");
objExports.ClientPluginBase = require("./src/ClientPluginBase");

objExports.Utils = require("./src/Utils.js");
objExports.Exception = require("./src/Exception");

objExports.EndpointBase = require("./src/EndpointBase.js");
objExports.Server = require("./src/Server.js");
objExports.ServerPluginBase = require("./src/ServerPluginBase");

objExports.BidirectionalWebsocketRouter = require("./src/BidirectionalWebsocketRouter.js");

objExports.Plugins = objExports.Plugins || {};
objExports.Plugins.Client = require("./src/Plugins/Client/index");
objExports.Plugins.Server = require("./src/Plugins/Server/index");

module.exports = objExports;
