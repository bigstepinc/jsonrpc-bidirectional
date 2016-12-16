const assert = require("assert");

const JSONRPC = {};
JSONRPC.Client = require("./Client");
JSONRPC.Exception = require("./Exception");

module.exports =
class OutgoingRequest
{
	/**
	 * @param {string} strMethod
	 * @param {Array} arrParams
	 * @param {number} nCallID
	 */
	constructor(strMethod, arrParams, nCallID)
	{
		this._strMethod = strMethod;
		this._arrParams = arrParams;

		this._requestObject = null;
		this._strRequestBody = null;

		this._strResponseBody = null;
		this._responseObject = null;

		this._mxResult = null;

		this._strEndpointURL = null;

		this._objHeaders = {};

		this._bCalled = false;

		//this._webSocket
		//this._httpRequest

		this._nCallID = nCallID;

		Object.seal(this);
	}


	/**
	 * @returns {number}
	 */
	get callID()
	{
		assert(typeof this._nCallID === "number");
		return this._nCallID;
	}


	/**
	 * @returns {Array|null} 
	 */
	get params()
	{
		return this._arrParams;
	}


	/**
	 * @param {Array} arrParams
	 */
	set params(arrParams)
	{
		assert(Array.isArray(arrParams));
		this._arrParams = arrParams;
	}


	/**
	 * @returns {String|null}
	 */
	get methodName()
	{
		return this._strMethod;
	}


	/**
	 * @param {string} strMethod
	 */
	set methodName(strMethod)
	{
		assert(typeof strMethod === "string");

		this._strMethod = strMethod;
	}


	/**
	 * @returns {Object} 
	 */
	get headers()
	{
		return this._objHeaders;
	}


	/**
	 * @returns {String|null}
	 */
	get endpointURL()
	{
		return this._strEndpointURL;
	}


	/**
	 * @param {string} strEndpointURL
	 */
	set endpointURL(strEndpointURL)
	{
		assert(typeof strEndpointURL === "string");

		this._strEndpointURL = strEndpointURL;
	}


	/**
	 * @returns {Object|Array|null}
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
		assert(objRequest.hasOwnProperty("method") || objRequest.hasOwnProperty("params"), JSON.stringify(objRequest));

		this._requestObject = objRequest;
	}


	/**
	 * @returns {string|null} 
	 */
	get requestBody()
	{
		return this._strRequestBody;
	}


	/**
	 * @param {string} strRequestBody 
	 */
	set requestBody(strRequestBody)
	{
		assert(typeof strRequestBody === "string");

		this._strRequestBody = strRequestBody;
	}

	
	/**
	 * @returns {boolean}
	 */
	get isMethodCalled()
	{
		return this._bCalled;
	}


	/**
	 * @param {boolean} bCalled
	 */
	set isMethodCalled(bCalled)
	{
		//assert(bCalled);
		this._bCalled = bCalled;
	}


	/**
	 * @returns {string|null} 
	 */
	get responseBody()
	{
		return this._strResponseBody;
	}


	/**
	 * @param {string} strResponseBody 
	 */
	set responseBody(strResponseBody)
	{
		assert(typeof strResponseBody === "string");

		this._strResponseBody = strResponseBody;
	}


	/**
	 * @returns {Object|Array|null}
	 */
	get responseObject()
	{
		return this._responseObject;
	}


	/**
	 * @param {Object|Array} objResponse
	 */
	set responseObject(objResponse)
	{
		if(
			typeof objResponse !== "object"
			&& !objResponse.hasOwnProperty("result")
			&& !objResponse.hasOwnProperty("error")
		)
		{
			throw new JSONRPC.Exception("Invalid response structure. RAW response: " + JSON.stringify(this._strResponseBody, undefined, "\t"), JSONRPC.Exception.PARSE_ERROR);
		}

		this._responseObject = objResponse;
	}


	/**
	 * @returns {number|string|null|Object|Array|Error}
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
		this.isMethodCalled = true;
		this._mxResult = mxResult;
	}


	/**
	 * @returns {Object}
	 */
	toRequestObject()
	{
		assert(this.methodName !== null);
		assert(Array.isArray(this.params));

		return {
			"method": this.methodName,
			"params": this.params,

			"id": this.callID,
			"jsonrpc": "2.0"
		};
	}
};
