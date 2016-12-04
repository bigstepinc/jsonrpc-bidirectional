const JSONRPC={};
JSONRPC.ServerPluginBase=require("../../ServerPluginBase");

module.exports=
class DebugLogger extends JSONRPC.ServerPluginBase
{
	/**
	 * Logs the received RAW request to stdout.
	 * 
	 * @param {JSONRPC.IncomingRequest} jsonrpcRequest
	 */
	beforeJSONDecode(jsonrpcRequest)
	{
		// @TODO: specify selected endpoint?
		console.log("["+(new Date()).toISOString()+"] Received JSONRPC request: "+jsonrpcRequest.requestBody+"\n");
	}

	/**
	 * Logs the RAW response to stdout.
	 * 
	 * @param {JSONRPC.IncomingRequest} jsonrpcRequest
	 */
	afterJSONEncode(jsonrpcRequest)
	{
		// @TODO: specify selected endpoint?
		console.log("["+(new Date()).toISOString()+"] Sending JSONRPC response: "+jsonrpcRequest.responseBody+"\n");
	}
};
