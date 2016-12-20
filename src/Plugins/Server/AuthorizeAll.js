const JSONRPC = {};
JSONRPC.ServerPluginBase = require("../../ServerPluginBase");

module.exports =
class AuthenticationSkip extends JSONRPC.ServerPluginBase
{
	/**
	 * @param {JSONRPC.IncomingRequest} incomingRequest
	 */
	beforeJSONDecode(incomingRequest)
	{
		incomingRequest.isAuthorized = true;
	}
};
