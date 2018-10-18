const JSONRPC = require("../../../../index");

module.exports =
class InvalidRequestJSON extends JSONRPC.ClientPluginBase
{
	/**
	 * @param {JSONRPC.OutgoingRequest} outgoingRequest
	 */
	async afterJSONEncode(outgoingRequest)
	{
		outgoingRequest.requestBody = outgoingRequest.requestBody.substr(0, outgoingRequest.requestBody.length - 2);
	}
};
