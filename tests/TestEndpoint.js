const JSONRPC = {};
JSONRPC.Exception = require("../src/Exception");
JSONRPC.EndpointBase = require("../src/EndpointBase");

module.exports =
class TestEndpoint extends JSONRPC.EndpointBase 
{
	constructor()
	{
		super(
			/*strName*/ "Test", 
			/*strPath*/ "/api", 
			/*objReflection*/ {}
		);

		Object.seal(this);
	}


	/**
	 * Hello world?
	 * 
	 * @param {string} strReturn
	 * 
	 * @returns {string}
	 */
	async ping(strReturn)
	{
		return strReturn;
	}


	/**
	 * Hello world?
	 * 
	 * @returns {string}
	 */
	async throwJSONRPCException()
	{
		throw new JSONRPC.Exception("JSONRPC.Exception", JSONRPC.Exception.INTERNAL_ERROR);
	}


	/**
	 * Hello world?
	 * 
	 * @returns {string}
	 */
	async throwError()
	{
		throw new Error("Error");
	}
};
