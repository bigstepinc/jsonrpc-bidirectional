const JSONRPC = {};
JSONRPC.ClientPluginBase = require("../src/ClientPluginBase");
JSONRPC.Exception = require("../src/Exception");

module.exports =
class ClientDebugMarkerPlugin extends JSONRPC.ClientPluginBase
{
	/**
	 * @param {string} strSite
	 */
	constructor(strSite)
	{
		super();

		this._strSite = strSite;
	}


	/**
	 * Gives a chance to modify the client request object before sending it out.
	 * 
	 * Normally, this allows extending the protocol.
	 * 
	 * @param {JSONRPC.OutgoingRequest} jsonrpcRequest
	 */
	async beforeJSONEncode(jsonrpcRequest)
	{
		// jsonrpcRequest.requestObject is available here.

		// jsonrpcRequest.headers and jsonrpcRequest.enpointURL may be modified here.

		jsonrpcRequest.requestObject.from = this._strSite;
	}
};
