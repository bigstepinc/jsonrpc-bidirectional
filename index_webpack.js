// Do not use const here, webpack/babel issues.
var objExports = {
	JSONRPC: require("./index")
};

delete objExports.JSONRPC.Plugins.Client.WebSocketTransport;
delete objExports.JSONRPC.Plugins.Client.ProcessStdIOTransport;

module.exports = objExports;
