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
		if(outgoingRequest.requestBody.length > 1024 * 1024)
		{
			console.log("[" + (new Date()).toISOString() + "] Sent JSONRPC request, " + outgoingRequest.requestObject.method + "(). Larger than 1 MB, not logging. \n");
		}
		else
		{
			console.log("[" + (new Date()).toISOString() + "] Sent JSONRPC request: " + outgoingRequest.requestBody + "\n");
		}
	}

	/**
	 * @param {JSONRPC.OutgoingRequest} outgoingRequest
	 */
	async beforeJSONDecode(outgoingRequest)
	{
		if(outgoingRequest.responseBody.length > 1024 * 1024)
		{
			console.log("[" + (new Date()).toISOString() + "] Received JSONRPC response, " + outgoingRequest.requestObject.method + "(). Larger than 1 MB, not logging. \n");
		}
		else
		{
			console.log("[" + (new Date()).toISOString() + "] Received JSONRPC response: " + outgoingRequest.responseBody + "\n");
		}
	}
};
