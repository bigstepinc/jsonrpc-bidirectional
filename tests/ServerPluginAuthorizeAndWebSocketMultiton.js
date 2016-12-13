const JSONRPC = {};
JSONRPC.ServerPluginBase = require("../src/ServerPluginBase");
JSONRPC.Exception = require("../src/Exception");

module.exports =
class ServerPluginAuthorizeAndWebSocketMultiton extends JSONRPC.ServerPluginBase
{
	/**
	 * Called after JSON parsing of the JSONRPC request.
	 * 
	 * @override
	 * 
	 * @param {JSONRPC.IncomingRequest} jsonrpcRequest
	 */
	async afterJSONDecode(jsonrpcRequest)
	{
		if(jsonrpcRequest.requestObject.method === "ImHereForTheParty")
		{
			jsonrpcRequest.isAuthenticated = true;
			jsonrpcRequest.isAuthorized = true;
		}
	}
};
