// Do not use const here, webpack/babel issues.
var objExports = {};

objExports.Client = require("./src/Client");
objExports.ClientPluginBase = require("./src/ClientPluginBase");

objExports.Utils = require("./src/Utils.js");
objExports.Exception = require("./src/Exception");

objExports.EndpointBase = require("./src/EndpointBase.js");
objExports.Server = require("./src/Server.js");
objExports.ServerPluginBase = require("./src/ServerPluginBase");

objExports.BidirectionalWebsocketRouter = require("./src/BidirectionalWebsocketRouter.js");
objExports.BidirectionalWorkerRouter = require("./src/BidirectionalWorkerRouter.js");
objExports.BidirectionalWebRTCRouter = require("./src/BidirectionalWebRTCRouter.js");
objExports.RouterBase = require("./src/RouterBase.js");


objExports.Plugins = objExports.Plugins || {};
objExports.Plugins.Client = require("./src/Plugins/Client");
objExports.Plugins.Server = require("./src/Plugins/Server");

objExports.WebSocketAdapters = objExports.WebSocketAdapters || {};
objExports.WebSocketAdapters.WebSocketWrapperBase = require("./src/WebSocketAdapters/WebSocketWrapperBase");
objExports.WebSocketAdapters.uws = objExports.WebSocketAdapters.uws || {};
objExports.WebSocketAdapters.uws.WebSocketWrapper = require("./src/WebSocketAdapters/uws/WebSocketWrapper");

module.exports = objExports;
