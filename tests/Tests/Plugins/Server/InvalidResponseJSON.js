const JSONRPC = require("../../../../index");

module.exports =
class InvalidResponseJSON extends JSONRPC.ServerPluginBase
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
