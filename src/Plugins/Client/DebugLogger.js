const JSONRPC = {};
JSONRPC.ClientPluginBase = require("../../ClientPluginBase");

module.exports =
class DebugLogger extends JSONRPC.ClientPluginBase
{
	/**
	 * @param {JSONRPC.OutgoingRequest} jsonrpcRequest
	 */
	afterJSONEncode(jsonrpcRequest)
	{
		console.log("Sent request at " + new Date() + "\n" + jsonrpcRequest.requestBody + "\n");
	}

	/**
	 * @param {JSONRPC.OutgoingRequest} jsonrpcRequest
	 */
	beforeJSONDecode(jsonrpcRequest)
	{
		console.log("Received response at " + new Date() + "\n" + jsonrpcRequest.responseBody + "\n");
	}
};
