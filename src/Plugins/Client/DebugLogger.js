const JSONRPC = {};
JSONRPC.ClientPluginBase = require("../../ClientPluginBase");

module.exports =
class DebugLogger extends JSONRPC.ClientPluginBase
{
	/**
	 * @param {JSONRPC.OutgoingRequest} outgoingRequest
	 */
	async afterJSONEncode(outgoingRequest)
	{
		console.log("[" + (new Date()).toISOString() + "] Sent JSONRPC request: " + outgoingRequest.requestBody + "\n");
	}

	/**
	 * @param {JSONRPC.OutgoingRequest} outgoingRequest
	 */
	async beforeJSONDecode(outgoingRequest)
	{
		console.log("[" + (new Date()).toISOString() + "] Received JSONRPC response: " + outgoingRequest.responseBody + "\n");
	}
};
