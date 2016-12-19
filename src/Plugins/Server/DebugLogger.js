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
	beforeJSONDecode(incomingRequest)
	{
		console.log("[" + (new Date()).toISOString() + "] Received JSONRPC request at endpoint path" + incomingRequest.endpoint.path + ": " + incomingRequest.requestBody + "\n");
	}

	/**
	 * Logs the RAW response to stdout.
	 * 
	 * @param {JSONRPC.IncomingRequest} incomingRequest
	 */
	afterJSONEncode(incomingRequest)
	{
		// @TODO: specify selected endpoint?
		console.log("[" + (new Date()).toISOString() + "] Sending JSONRPC response: " + incomingRequest.responseBody + "\n");
	}
};
