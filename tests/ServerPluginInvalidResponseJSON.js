const JSONRPC = {};
JSONRPC.ServerPluginBase = require("../src/ServerPluginBase");
JSONRPC.Exception = require("../src/Exception");

module.exports =
class ServerPluginInvalidResponseJSON extends JSONRPC.ServerPluginBase
{
	async response(objResponse)
	{
		for(let strKey in objResponse)
		{
			delete objResponse[strKey];
		}

		objResponse.helloFromMars = ".... . .-.. .-.. --- / ..-. .-. --- -- / -- .- .-. ...";
	}
};
