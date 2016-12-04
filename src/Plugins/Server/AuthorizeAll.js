const JSONRPC={};
JSONRPC.ServerPluginBase=require("../../ServerPluginBase");

module.exports=
class AuthenticationSkip extends JSONRPC.ServerPluginBase
{
	/**
	 * @param {JSONRPC.IncomingRequest} jsonrpcRequest
	 */
	beforeJSONDecode(jsonrpcRequest)
	{
		jsonrpcRequest.isAuthorized=true;
	}
};
