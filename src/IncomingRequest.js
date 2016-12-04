const assert = require("assert");

const JSONRPC = {};
JSONRPC.EndpointBase = require("./EndpointBase");


module.exports=
class IncomingRequest
{
	constructor()
	{
		this._bAuthenticated=false;
		this._bAuthorized=false;
		this._strBody=null;
		this._requestObject=null;
		this._endpoint=null;

		this._mxResult=null;
		this._bMethodCalled=false;

		Object.seal(this);
	}


	/**
	 * @return {boolean}
	 */
	get isAuthenticated()
	{
		return this._bAuthenticated;
	}


	/**
	 * @param {boolean} bAuthenticated
	 */
	set isAuthenticated(bAuthenticated)
	{
		assert(typeof bAuthenticated === "boolean");
		this._bAuthenticated=bAuthenticated;
	}


	/**
	 * @return {boolean}
	 */
	get isAuthorized()
	{
		return this._bAuthorized;
	}


	/**
	 * @param {boolean} bAuthorized
	 */
	set isAuthorized(bAuthorized)
	{
		assert(typeof bAuthorized === "boolean");
		this._bAuthorized=bAuthorized;
	}


	/**
	 * @return {String|null}
	 */
	get body()
	{
		return this._strBody;
	}


	/**
	 * @param {String} strBody
	 */
	set body(strBody)
	{
		assert(typeof strBody === "string");

		this._strBody=strBody;
	}


	/**
	 * @return {Object|Array|null}
	 */
	get requestObject()
	{
		return this._requestObject;
	}


	/**
	 * @param {Object|Array} objRequest
	 */
	set requestObject(objRequest)
	{
		assert(typeof objRequest === "object" || Array.isArray(objRequest));

		this._requestObject=objRequest;
	}


	/**
	 * @return {JSONRPC.EndpointBase|null}
	 */
	get endpoint()
	{
		return this._endpoint;
	}


	/**
	 * @param {JSONRPC.EndpointBase} endpoint
	 */
	set endpoint(endpoint)
	{
		assert(endpoint instanceof JSONRPC.EndpointBase);

		this._endpoint=endpoint;
	}


	/**
	 * @return {boolean}
	 */
	get isMethodCalled()
	{
		return this._bMethodCalled;
	}


	/**
	 * @param {boolean} bMethodCalled
	 */
	set isMethodCalled(bMethodCalled)
	{
		assert(typeof bMethodCalled === "boolean");
		this._bMethodCalled=bMethodCalled;
	}


	/**
	 * @return {number|string|null|Object|Array|Error}
	 */
	get callResult()
	{
		return this._mxResult;
	}

	
	/**
	 * @param {number|string|null|Object|Array|Error} mxResult
	 */
	set callResult(mxResult)
	{
		this.isMethodCalled=true;
		this._mxResult=mxResult;
	}
};
