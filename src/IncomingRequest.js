const assert = require("assert");

const JSONRPC = {};
JSONRPC.EndpointBase = require("./EndpointBase");
JSONRPC.Exception = require("./Exception");
JSONRPC.Server = require("./Server");
JSONRPC.RouterBase = require("./RouterBase");


module.exports =
class IncomingRequest
{
	constructor()
	{
		this._bAuthenticated = false;
		this._bAuthorized = false;
		this._mxRequestBody = null;
		this._requestObject = null;
		this._endpoint = null;
		this._router = null;
		
		this._mxResult = null;
		this._objResponseToBeSerialized = null;
		this._mxResultSerialized = null;
		this._bMethodCalled = false;

		this._nConnectionID = null;

		this._classClient = null;

		this._objHeaders = {};
		this._strRemoteAddress = "";

		//this._webSocket
		//this._httpRequest

		Object.seal(this);
	}


	/**
	 * @returns {boolean}
	 */
	get isAuthenticated()
	{
		return this._bAuthenticated;
	}


	/**
	 * @returns {number|null}
	 */
	get connectionID()
	{
		return this._nConnectionID;
	}


	/**
	 * @param {number} nConnectionID
	 */
	set connectionID(nConnectionID)
	{
		assert(typeof nConnectionID === "number" && parseInt(nConnectionID, 10) === nConnectionID);
		this._nConnectionID = nConnectionID;
	}


	/**
	 * @param {boolean} bAuthenticated
	 */
	set isAuthenticated(bAuthenticated)
	{
		assert(typeof bAuthenticated === "boolean");
		this._bAuthenticated = bAuthenticated;
	}


	/**
	 * @returns {boolean}
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
		this._bAuthorized = bAuthorized;
	}


	/**
	 * @returns {string|Object|null}
	 */
	get requestBody()
	{
		return this._mxRequestBody;
	}


	/**
	 * @param {string|Object} mxRequestBody
	 */
	set requestBody(mxRequestBody)
	{
		this._mxRequestBody = mxRequestBody;
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

		this._requestObject = objRequest;
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
		return (
			this._requestObject !== null 
			&& typeof this._requestObject === "object"
			&& !this.requestObject.hasOwnProperty("id")
		);
	}


	/**
	 * @returns {JSONRPC.EndpointBase|null}
	 */
	get endpoint()
	{
		return this._endpoint;
	}


	/**
	 * endpoint.ReverseCallsClientClass may be null or a class for an API client.
	 * See .router
	 * 
	 * @param {JSONRPC.EndpointBase} endpoint
	 */
	set endpoint(endpoint)
	{
		assert(endpoint instanceof JSONRPC.EndpointBase);

		this._endpoint = endpoint;
	}


	/**
	 * @param {JSONRPC.RouterBase} router
	 */
	set router(router)
	{
		//assert(router.constructor.name === "BidirectionalWebsocketRouter", "router must be an instance of BidirectionalWebsocketRouter.");
		assert(router instanceof JSONRPC.RouterBase);

		this._router = router;
	}


	/**
	 * @returns {Class}
	 */
	get reverseCallsClient()
	{
		if(this._classClient === null)
		{
			if(
				this.connectionID !== null
				&& this.endpoint
				&& this.endpoint.ReverseCallsClientClass
			)
			{
				this._classClient = this._router.connectionIDToSingletonClient(this.connectionID, this.endpoint.ReverseCallsClientClass);
			}
		}

		return this._classClient;
	}


	/**
	 * @returns {boolean}
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
		this._bMethodCalled = bMethodCalled;
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
	get callResultToBeSerialized()
	{
		return this._objResponseToBeSerialized;
	}


	/**
	 * @param {Object} objResultToBeSerialized
	 */
	set callResultToBeSerialized(objResultToBeSerialized)
	{
		this._objResponseToBeSerialized = objResultToBeSerialized;
	}


	/**
	 * @returns {string|Buffer|Object}
	 */
	get callResultSerialized()
	{
		return this._mxResultSerialized;
	}


	/**
	 * @param {string|Buffer|Object} mxResultSerialized
	 */
	set callResultSerialized(mxResultSerialized)
	{
		this._mxResultSerialized = mxResultSerialized;
	}


	/**
	 * @returns {Object}
	 */
	get headers()
	{
		return this._objHeaders;
	}


	/**
	 * @param {Object} objHeaders
	 */
	set headers(objHeaders)
	{
		this._objHeaders = objHeaders;
	}


	/**
	 * @returns {string}
	 */
	get remoteAddress()
	{
		return this._strRemoteAddress;
	}


	/**
	 * @param {string} strRemoteAddress
	 */
	set remoteAddress(strRemoteAddress)
	{
		this._strRemoteAddress = strRemoteAddress;
	}


	/**
	 * @returns {Object}
	 */
	toResponseObject()
	{
		let objResponse = {id: null, "jsonrpc": "2.0"};

		if(this.callResult instanceof Error)
		{
			objResponse.error = {
				message: this.callResult.message,
				code: (this.callResult instanceof JSONRPC.Exception) ? this.callResult.code : 0,
				data: this.callResult.stack.split(/[\r\n]+/mg)
			};
		}
		else
		{
			objResponse.result = this.callResult === undefined ? null : this.callResult; 
		}

		if(
			this._requestObject !== null
			&& typeof this._requestObject === "object" 
			&& this._requestObject.hasOwnProperty("id")
		)
		{
			objResponse.id = this._requestObject.id;
		}

		return objResponse;
	}
};
