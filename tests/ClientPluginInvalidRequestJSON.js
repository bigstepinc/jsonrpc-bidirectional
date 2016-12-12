const JSONRPC = {};
JSONRPC.ClientPluginBase = require("../src/ClientPluginBase");
JSONRPC.Exception = require("../src/Exception");

module.exports =
class ClientPluginInvalidRequestJSON extends JSONRPC.ClientPluginBase
{
	/**
	 * @param {JSONRPC.OutgoingRequest} jsonrpcRequest
	 */
	async afterJSONEncode(jsonrpcRequest)
	{
		jsonrpcRequest.requestBody = jsonrpcRequest.requestBody.substr(0, jsonrpcRequest.requestBody.length - 2);
	}
};
