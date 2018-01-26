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

module.exports = objExports;
