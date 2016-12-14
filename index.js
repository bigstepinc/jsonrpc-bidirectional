const objExports = {};
objExports.JSONRPC = {};

objExports.JSONRPC.Client = require("./src/Client");
objExports.JSONRPC.ClientPluginBase = require("./src/ClientPluginBase");

objExports.JSONRPC.Utils = require("./src/Utils.js");
objExports.JSONRPC.Exception = require("./src/Exception");

objExports.JSONRPC.EndpointBase = require("./src/EndpointBase.js");
objExports.JSONRPC.Server = require("./src/Server.js");

objExports.JSONRPC.BidirectionalWebsocketRouter = require("./src/BidirectionalWebsocketRouter.js");

objExports.JSONRPC.Plugins = objExports.JSONRPC.Plugins || {};
objExports.JSONRPC.Plugins.Client = require("./src/Plugins/Client/index");
objExports.JSONRPC.Plugins.Server = require("./src/Plugins/Server/index");

module.exports = objExports;
