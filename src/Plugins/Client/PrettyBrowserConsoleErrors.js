const JSONRPC = {};
JSONRPC.ClientPluginBase = require("../../ClientPluginBase");
JSONRPC.Exception = require("../../Exception");

module.exports =
class PrettyBrowserConsoleErrors extends JSONRPC.ClientPluginBase
{
	/**
	 * @param {JSONRPC.OutgoingRequest} outgoingRequest
	 */
	async exceptionCatch(outgoingRequest)
	{
		console.error(outgoingRequest.callResult);
	}
};
