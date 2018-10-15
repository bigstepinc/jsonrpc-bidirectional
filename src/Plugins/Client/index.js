// Do not use const here, webpack/babel issues.
var objExports = {};

objExports.Cache = require("./Cache");
objExports.DebugLogger = require("./DebugLogger");
objExports.PrettyBrowserConsoleErrors = require("./PrettyBrowserConsoleErrors");
objExports.SignatureAdd = require("./SignatureAdd");
objExports.WebSocketTransport = require("./WebSocketTransport");
objExports.WorkerTransport = require("./WorkerTransport");
objExports.ProcessStdIOTransport = require("./ProcessStdIOTransport");
objExports.WebRTCTransport = require("./WebRTCTransport");
objExports.ElectronIPCTransport = require("./ElectronIPCTransport");

if(process && parseInt(process.version.replace("v", "").split(".", 2)[0]) >= 10)
{
	objExports.WorkerThreadTransport = require("./WorkerThreadTransport");
}

module.exports = objExports;
