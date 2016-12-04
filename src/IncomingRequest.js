const assert = require("assert");

const http = require("http");

const JSONRPC = {};
JSONRPC.EndpointBase = require("./EndpointBase");
JSONRPC.Exception = require("./Exception");
JSONRPC.Server = require("./Server");


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

		this._httpRequest=null;

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
	 * @return {http.IncomingMessage|null}
	 */
	get httpRequest()
	{
		return this._httpRequest;
	}


	/**
	 * @param {http.IncomingMessage} httpRequest
	 */
	set httpRequest(httpRequest)
	{
		assert(httpRequest instanceof http.IncomingMessage);

		this._httpRequest=httpRequest;
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
	 * JSON-RPC 2.0 specification:
	 * An identifier established by the Client that MUST contain a String, Number, or NULL value if included.
	 * If it is not included it is assumed to be a notification.
	 * The value SHOULD normally not be Null and Numbers SHOULD NOT contain fractional parts.
	 * 
	 * @return {boolean}
	 */
	get isNotification()
	{
		return (
			this._requestObject !== null
			&& typeof this._requestObject === "object" 
			&& !this.requestObject.hasOwnProperty("id")
		);
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


	/**
	 * @return {Object}
	 */
	toResponseObject()
	{
		let objResponse={id: null};

		if(this.callResult instanceof Error)
		{
			objResponse.error={
				message: this.callResult.message,
				code: (this.callResult instanceof JSONRPC.Exception) ? this.callResult.code : 0
			};
		}
		else
		{
			objResponse.result = this.callResult; 
		}

		if(
			this._requestObject !== null
			&& typeof this._requestObject === "object" 
			&& this._requestObject.hasOwnProperty("id")
		)
		{
			objResponse.id = this._requestObject.id;
		}
		objResponse.jsonrpc = JSONRPC.Server.JSONRPC_VERSION;

		return objResponse;
	}
};
