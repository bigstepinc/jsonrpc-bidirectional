const JSONRPC = {};
JSONRPC.ServerPluginBase = require("../src/ServerPluginBase");
JSONRPC.Exception = require("../src/Exception");

module.exports =
class ServerDebugMarkerPlugin extends JSONRPC.ServerPluginBase
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
	 * This is called with the actual response object.
	 * 
	 * objResponse is a standard JSONRPC 2.0 response object.
	 * 
	 * @param {JSONRPC.IncomingRequest} incomingRequest
	 */
	async response(incomingRequest)
	{
		// Gives a chance to modify the server response object before sending it out.

		incomingRequest.callResultToBeSerialized.from = this._strSite;

		// Normally, this allows extending the protocol.
	}
};
