const JSONRPC = {};
JSONRPC.ServerPluginBase = require("../src/ServerPluginBase");
JSONRPC.Exception = require("../src/Exception");

module.exports =
class ServerPluginInvalidResponseJSON extends JSONRPC.ServerPluginBase
{
	/**
	 * @param {JSONRPC.IncomingRequest} incomingRequest
	 */
	async response(incomingRequest)
	{
		for(let strKey in incomingRequest.callResultToBeSerialized)
		{
			delete incomingRequest.callResultToBeSerialized[strKey];
		}

		incomingRequest.callResultToBeSerialized.helloFromMars = ".... . .-.. .-.. --- / ..-. .-. --- -- / -- .- .-. ...";

		console.log(incomingRequest.callResultToBeSerialized);
	}
};
