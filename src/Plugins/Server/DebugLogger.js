const JSONRPC = {};
JSONRPC.ServerPluginBase = require("../../ServerPluginBase");

module.exports =
class DebugLogger extends JSONRPC.ServerPluginBase
{
	/**
	 * Logs the received RAW request to stdout.
	 * 
	 * @param {JSONRPC.IncomingRequest} incomingRequest
	 */
	async beforeJSONDecode(incomingRequest)
	{
		if(incomingRequest.requestBody.length > 1024 * 1024)
		{
			console.log("[" + (new Date()).toISOString() + "] Received JSONRPC request at endpoint path" + incomingRequest.endpoint.path + ", " + incomingRequest.requestObject.method + "(). Larger than 1 MB, not logging. \n");
		}
		else
		{
			console.log("[" + (new Date()).toISOString() + "] Received JSONRPC request at endpoint path" + incomingRequest.endpoint.path + ": " + incomingRequest.requestBody + "\n");
		}
	}

	/**
	 * Logs the RAW response to stdout.
	 * 
	 * @param {JSONRPC.IncomingRequest} incomingRequest
	 */
	async afterSerialize(incomingRequest)
	{
		// @TODO: specify selected endpoint?

		if(incomingRequest.requestBody.length > 1024 * 1024)
		{
			console.log("[" + (new Date()).toISOString() + "] Sending JSONRPC response, " + incomingRequest.requestObject.method + "(). Larger than 1 MB, not logging. \n");
		}
		else
		{
			console.log("[" + (new Date()).toISOString() + "] Sending JSONRPC response: " + incomingRequest.callResultSerialized + "\n");
		}
	}
};
