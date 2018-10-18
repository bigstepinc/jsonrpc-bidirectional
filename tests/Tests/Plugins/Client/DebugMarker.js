const JSONRPC = require("../../../../index");

module.exports =
class DebugMarker extends JSONRPC.ClientPluginBase
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
	 * @param {JSONRPC.OutgoingRequest} outgoingRequest
	 */
	async beforeJSONEncode(outgoingRequest)
	{
		// outgoingRequest.requestObject is available here.

		// outgoingRequest.headers and outgoingRequest.enpointURL may be modified here.

		outgoingRequest.requestObject.from = this._strSite;
	}
};
