const JSONRPC = {};
JSONRPC.ClientPluginBase = require("../src/ClientPluginBase");
JSONRPC.Exception = require("../src/Exception");

module.exports =
class ClientPluginInvalidRequestJSON extends JSONRPC.ClientPluginBase
{
	/**
	 * @param {JSONRPC.OutgoingRequest} outgoingRequest
	 */
	async afterJSONEncode(outgoingRequest)
	{
		outgoingRequest.requestBody = outgoingRequest.requestBody.substr(0, outgoingRequest.requestBody.length - 2);
	}
};
