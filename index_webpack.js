const objExports = {
	JSONRPC: require("./index")
};

delete objExports.JSONRPC.Plugins.Client.WebSocketTransport;
delete objExports.JSONRPC.Plugins.Client.ProcessStdIOTransport;

module.exports = objExports;
