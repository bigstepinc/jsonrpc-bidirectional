// Do not use const here, webpack/babel issues.
var objExports = {
	Client: require("./src/Client"),
	ClientPluginBase: require("./src/ClientPluginBase"),

	Server: require("./src/Server"),
	ServerPluginBase: require("./src/ServerPluginBase"),

	EndpointBase: require("./src/EndpointBase"),

	BidirectionalWebsocketRouter: require("./src/BidirectionalWebsocketRouter"),
	BidirectionalWorkerRouter: require("./src/BidirectionalWorkerRouter"),
	BidirectionalWebRTCRouter: require("./src/BidirectionalWebRTCRouter"),
	BidirectionalElectronIPC: require("./src/BidirectionalElectronIPC"),
	RouterBase: require("./src/RouterBase"),
	
	Exception: require("./src/Exception"), 

	Utils: require("./src/Utils"),

	Plugins: {
		Client: require("./src/Plugins/Client"),
		Server: require("./src/Plugins/Server")
	},

	WebSocketAdapters: {
		WebSocketWrapperBase: require("./src/WebSocketAdapters/WebSocketWrapperBase"),
		uws: {
			WebSocketWrapper: require("./src/WebSocketAdapters/uws/WebSocketWrapper")
		}
	},

	NodeClusterBase: require("./src/NodeClusterBase")
};


let bWorkerThreadsSupportExists = false;
try
{
	require("worker_threads");
	bWorkerThreadsSupportExists = true;
}
catch(error)
{
}

if(bWorkerThreadsSupportExists)
{
	objExports.NodeWorkerThreadsBase = require("./src/NodeWorkerThreadsBase");
}


if(process && parseInt(process.version.replace("v", "").split(".", 2)[0]) >= 10)
{
	objExports.BidirectionalWorkerThreadRouter = require("./src/BidirectionalWorkerThreadRouter");
}

module.exports = objExports;
