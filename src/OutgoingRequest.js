const assert = require("assert");

const JSONRPC = {};
JSONRPC.Client = require("./Client");
JSONRPC.Exception = require("./Exception");

module.exports =
class OutgoingRequest
{
	/**
	 * An undefined mxCallID value represents a JSONRPC 2.0 notification request which results in omitting the "id" property in the JSONRPC 2.0 request.
	 * 
	 * A mxCallID null is not allowed for this JSONRPC 2.0 client library as it cannot be used to match asynchronous requests to out of order responses.
	 * The spec also recommends in avoiding null when composing requests.
	 * 
	 * arrTransferList is passed as the second param of postMessage further down the road:
	 * https://nodejs.org/dist/latest-v10.x/docs/api/worker_threads.html#worker_threads_port_postmessage_value_transferlist
	 * https://nodejs.org/dist/latest-v10.x/docs/api/worker_threads.html#worker_threads_worker_postmessage_value_transferlist
	 * https://developer.mozilla.org/en-US/docs/Web/API/Worker/postMessage
	 * 
	 * @param {string} strMethod
	 * @param {Array} arrParams
	 * @param {number|string|undefined} mxCallID
	 * @param {ArrayBuffer[]|Transferable[]} arrTransferList
	 */
	constructor(strMethod, arrParams, mxCallID, arrTransferList = [])
	{
		this._strMethod = strMethod;
		this._arrParams = arrParams;

		this._requestObject = null;
		this._mxRequestBody = null;

		this._mxResponseBody = null;
		this._responseObject = null;

		this._mxResult = null;

		this._strEndpointURL = null;

		this._objHeaders = {};

		this._bCalled = false;

		//this._webSocket
		//this._httpRequest

		this._mxCallID = mxCallID;

		this._arrTransferList = arrTransferList;

		Object.seal(this);
	}


	/**
	 * An undefined value represents a JSONRPC 2.0 notification request which results in omitting the "id" property in the JSONRPC 2.0 request.
	 * 
	 * null is not allowed for this JSONRPC 2.0 client library as it cannot be used to match asynchronous requests to out of order responses.
	 * The spec also recommends in avoiding null when composing requests.
	 * 
	 * @returns {number|string|undefined}
	 */
	get callID()
	{
		assert(
			typeof this._mxCallID === "number" || typeof this._mxCallID === "string" || typeof this._mxCallID === "undefined",
			"this._mxCallID must be of type number."
		);
		return this._mxCallID;
	}


	/**
	 * JSON-RPC 2.0 specification:
	 * An identifier established by the Client that MUST contain a String, Number, or NULL value if included.
	 * If it is not included it is assumed to be a notification.
	 * The value SHOULD normally not be Null and Numbers SHOULD NOT contain fractional parts.
	 * 
	 * @returns {boolean}
	 */
	get isNotification()
	{
		return typeof this._mxCallID === "undefined";
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
		assert(Array.isArray(arrParams), "arrParams must be of type Array.");
		this._arrParams = arrParams;
	}


	/**
	 * @returns {string|null}
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
		assert(typeof strMethod === "string", "strMethod must be of type string.");

		this._strMethod = strMethod;
	}


	/**
	 * @returns {object} 
	 */
	get headers()
	{
		return this._objHeaders;
	}


	/**
	 * @returns {string|null}
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
		assert(typeof strEndpointURL === "string", "strEndpointURL must be of type string.");

		this._strEndpointURL = strEndpointURL;
	}


	/**
	 * @returns {object|Array|null}
	 */
	get requestObject()
	{
		return this._requestObject;
	}


	/**
	 * @param {object|Array} objRequest
	 */
	set requestObject(objRequest)
	{
		assert(typeof objRequest === "object" || Array.isArray(objRequest), "objRequest must be of type Object or Array.");
		assert(objRequest.hasOwnProperty("method") || objRequest.hasOwnProperty("params"), JSON.stringify(objRequest), "objRequest must have either a method or params property.");

		this._requestObject = objRequest;
	}


	/**
	 * @returns {string|null} 
	 */
	get requestBody()
	{
		return this._mxRequestBody;
	}


	/**
	 * @param {string|object} mxRequestBody 
	 */
	set requestBody(mxRequestBody)
	{
		this._mxRequestBody = mxRequestBody;
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
	 * @returns {string|object|null} 
	 */
	get responseBody()
	{
		return this._mxResponseBody;
	}


	/**
	 * @param {string|object} mxResponseBody 
	 */
	set responseBody(mxResponseBody)
	{
		assert(typeof mxResponseBody === "string" || typeof mxResponseBody === "object", "mxResponseBody must be of type string or Object.");

		this._mxResponseBody = mxResponseBody;
	}


	/**
	 * @returns {object|Array|null}
	 */
	get responseObject()
	{
		return this._responseObject;
	}


	/**
	 * @param {object|Array} objResponse
	 */
	set responseObject(objResponse)
	{
		if(
			typeof objResponse !== "object"
			&& !objResponse.hasOwnProperty("result")
			&& !objResponse.hasOwnProperty("error")
		)
		{
			throw new JSONRPC.Exception("Invalid response structure. RAW response: " + JSON.stringify(this._mxResponseBody, undefined, "\t"), JSONRPC.Exception.PARSE_ERROR);
		}

		this._responseObject = objResponse;
	}


	/**
	 * @returns {number|string|null|object|Array|Error}
	 */
	get callResult()
	{
		this.isMethodCalled = true;

		return this._mxResult;
	}

	
	/**
	 * @param {number|string|null|object|Array|Error} mxResult
	 */
	set callResult(mxResult)
	{
		//assert(!this.isMethodCalled, "JSONRPC.OutgoingRequest.isMethodCalled is already true, set by another plugin maybe?");

		this.isMethodCalled = true;
		this._mxResult = mxResult;
	}

	/**
	 * @returns {ArrayBuffer[]|Transferable[]}
	 */
	get transferList()
	{
		return this._arrTransferList;
	}

	/**
	 * @returns {object}
	 */
	toRequestObject()
	{
		assert(this.methodName !== null, "this.methodName cannot be null.");
		assert(Array.isArray(this.params), "this.params must be an Array.");

		if(typeof this.callID !== "undefined")
		{
			return {
				"method": this.methodName,
				"params": this.params,

				// The "id" property can never be null in an asynchronous JSONRPC 2.0 client, because out of order responses must be matched to asynchronous requests. 
				// The spec recommends against null values in general anyway.

				"id": this.callID, 
				"jsonrpc": "2.0"
			};
		}
		else
		{
			// JSONRPC 2.0 notification request, which does not expect an answer at all from the server.

			return {
				"method": this.methodName,
				"params": this.params,

				// The ID property must be omitted entirely for JSONRPC 2.0 notification requests.
				// A setting of undefined will ignore it when serializing to JSON, 
				// however it is safer for custom non-JSON serializations to omit it explicitly here.

				"jsonrpc": "2.0"
			};
		}
	}
};
