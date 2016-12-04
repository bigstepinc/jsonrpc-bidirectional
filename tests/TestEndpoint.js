const JSONRPC={};
JSONRPC.Exception=require("../src/Exception");
JSONRPC.EndpointBase=require("../src/EndpointBase");

module.exports=
class TestEndpoint extends JSONRPC.EndpointBase 
{
	constructor()
	{
		super(
			/*strName*/ "Test", 
			/*strPath*/ "/api", 
			/*objReflection*/ {}
		);
	}


	/**
	 * Hello world?
	 * 
	 * @return {string}
	 */
	async ping()
	{
		return "pong";
	}


	/**
	 * Hello world?
	 * 
	 * @return {string}
	 */
	async throwJSONRPCException()
	{
		throw new JSONRPC.Exception("JSONRPC.Exception", JSONRPC.Exception.INTERNAL_ERROR);
	}


	/**
	 * Hello world?
	 * 
	 * @return {string}
	 */
	async throwError()
	{
		throw new Error("Error");
	}
};
