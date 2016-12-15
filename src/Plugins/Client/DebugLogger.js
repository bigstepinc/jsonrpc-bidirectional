const JSONRPC = {};
JSONRPC.ClientPluginBase = require("../../ClientPluginBase");

module.exports =
class DebugLogger extends JSONRPC.ClientPluginBase
{
	/**
	 * @param {JSONRPC.OutgoingRequest} jsonrpcRequest
	 */
	async afterJSONEncode(jsonrpcRequest)
	{
		console.log("[" + (new Date()).toISOString() + "] Sent JSONRPC request: " + jsonrpcRequest.requestBody + "\n");
	}

	/**
	 * @param {JSONRPC.OutgoingRequest} jsonrpcRequest
	 */
	async beforeJSONDecode(jsonrpcRequest)
	{
		console.log("[" + (new Date()).toISOString() + "] Received JSONRPC response at: " + jsonrpcRequest.responseBody + "\n");
	}
};
