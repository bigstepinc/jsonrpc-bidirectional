const assert = require("assert");

const JSONRPC = {};
JSONRPC.EndpointBase = require("./EndpointBase");
JSONRPC.Exception = require("./Exception");
JSONRPC.Server = require("./Server");
JSONRPC.RouterBase = require("./RouterBase");

const { URL } = require("url");
const querystring = require("querystring");

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
		this._strLocalAddress = "";

		this._objHTTPIncomingMessage = null;
		this._objHTTPServerResponse = null;

		this._objSession = {};
		//this._webSocket
		//this._httpRequest

		// Only change this to true if it is safe to export stack traces to the RPC called.
		this._bStackInErrorMessage = false;

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
		assert(typeof nConnectionID === "number" && parseInt(nConnectionID, 10) === nConnectionID, "Connection ID must be an integer.");
		this._nConnectionID = nConnectionID;
	}


	/**
	 * @param {boolean} bAuthenticated
	 */
	set isAuthenticated(bAuthenticated)
	{
		assert(typeof bAuthenticated === "boolean", "bAuthenticated must be of type boolean.");
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
		assert(typeof bAuthorized === "boolean", "bAuthorized must be of type boolean.");
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
	 * Contains the query of the HTTP GET request as an object.
	 *
	 * @returns {Object|null}
	 */
	get requestHTTPGetQuery()
	{
		if(typeof this.httpIncomingMessage === "undefined" || this.httpIncomingMessage === null)
		{
			return null;
		}
		let strQuery = this.httpIncomingMessage.url;
		if(strQuery.includes("?"))
		{
			strQuery = strQuery.split("?")[1];
		}

		return querystring.parse(strQuery);
	}


	/**
	 * Contains the HTTP method of the request. The value is converted to uppercase.
	 * Supported values are: GET and POST.
	 * This is null when the request is not HTTP.
	 *
	 * @returns {string|null}
	 */
	get requestHTTPMethod()
	{
		if(typeof this.httpIncomingMessage === "undefined" || this.httpIncomingMessage === null)
		{
			return null;
		}

		return this.httpIncomingMessage.method;
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
		assert(typeof objRequest === "object" || Array.isArray(objRequest), "objRequest must be of type Array or Object.");

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
		assert(endpoint instanceof JSONRPC.EndpointBase, "endpoint must extend JSONRPC.EndpointBase");

		this._endpoint = endpoint;
	}


	/**
	 * @param {JSONRPC.RouterBase} router
	 */
	set router(router)
	{
		//assert(router.constructor.name === "BidirectionalWebsocketRouter", "router must be an instance of BidirectionalWebsocketRouter.");
		assert(router instanceof JSONRPC.RouterBase, "router must extend JSONRPC.RouterBase.");

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
		assert(typeof bMethodCalled === "boolean", "bMethodCalled must be of type boolean.");
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
	 * Consulted when serializing the response.
	 * Determines if the stack trace will be appended to the error message, in case of returning an error.
	 * 
	 * @returns {boolean}
	 */
	get stackInErrorMessage()
	{
		return this._bStackInErrorMessage;
	}


	/**
	 * @param {boolean} bAllow
	 */
	set stackInErrorMessage(bAllow)
	{
		this._bStackInErrorMessage = bAllow;
	}


	/**
	 * @param {string|Buffer|Object} mxResultSerialized
	 */
	set callResultSerialized(mxResultSerialized)
	{
		this._mxResultSerialized = mxResultSerialized;
	}

	/**
	 * @returns {http.ServerResponse | null}
	 */
	get httpServerResponse()
	{
		return this._objHTTPServerResponse || null;
	}


	/**
	 * Sets the HTTP Server Response.
	 *
	 * @param {Object | null} value
	 */
	set httpServerResponse(value)
	{
		if(typeof value !== "object")
		{
			throw new TypeError(`Invalid type ${typeof value} for httpServerResponse property in ${this.constructor.name}. Expected "object".`);
		}

		this._objHTTPServerResponse = value;
	}


	/**
	 * @returns {http.IncomingMessage | null}
	 */
	get httpIncomingMessage()
	{
		return this._objHTTPIncomingMessage || null;
	}


	/**
	 * Sets the HTTP Incoming Request.
	 *
	 * @param {Object | null} value
	 */
	set httpIncomingMessage(value)
	{
		if(typeof value !== "object")
		{
			throw new TypeError(`Invalid type ${typeof value} for httpServerResponse property in ${this.constructor.name}. Expected "object".`);
		}

		this._objHTTPIncomingMessage = value;
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
	 * General purpose session context object.
	 * Does not imply any logic, and applications must manage it's lifecycle.
	 * 
	 * It is recommended to set a reference to an object and not recreate it multiple times.
	 * 
	 * If multiple plugins needs their own session, sandbox each plugin's stuff into its own key.
	 * 
	 * @returns {Object|null}
	 */
	get session() 
	{
		return this._objSession;
	}


	/**
	 * General purpose session context object.
	 * Does not imply any logic, and applications must manage it's lifecycle.
	 * 
	 * It is recommended to set a reference to an object and not recreate it multiple times.
	 * 
	 * If multiple plugins needs their own session, sandbox each plugin's stuff into its own key.
	 * 
	 * @param {Object} objSession
	 */
	set session(objSession)
	{
		if(typeof objSession !== "object")
		{
			throw new TypeError(`Invalid set value of type "${typeof objSession}" for session. Expected "object"`);
		}

		this._objSession = objSession;
	}


	/**
	 * @param {Object} objResponseHeaders
	 */
	addHTTPResponseHeaders(objResponseHeaders)
	{
		if(typeof this.httpServerResponse === "undefined" || this.httpServerResponse === null)
		{
			throw new Error("Error when trying to add HTTP response headers. The httpServerResponse is not set on the IncomingRequest instance.");
		}

		if(typeof objResponseHeaders !== "object")
		{
			throw new TypeError(`Invalid type "${typeof objResponseHeaders}" for extraResponseHeaders set on incomingRequest. Expected "object".`);
		};

		// Make sure headers are lowercased, like the specification from Node.js.
		// And avoid header injection.
		for(let strHeaderName in objResponseHeaders)
		{
			if(strHeaderName !== strHeaderName.toLowerCase())
			{
				throw new TypeError(`Invalid extra response header key ${strHeaderName}. Keys must be lowercased.`);
			}

			let mxHeaderValue = objResponseHeaders[strHeaderName];

			if(typeof mxHeaderValue !== "string")
			{
				throw new TypeError(`Invalid extra response header value ${JSON.stringify(mxHeaderValue)} for key ${strHeaderName}. Only string values are allowed.`);
			}

			mxHeaderValue = querystring.unescape(mxHeaderValue);

			if(
				mxHeaderValue.includes("\n")
				|| mxHeaderValue.includes("\r")
			)
			{
				throw new Error(`Invalid extra response header value ${JSON.stringify(mxHeaderValue)}.`);
			}
		}

		for(let strHeaderName in objResponseHeaders)
		{
			this.httpServerResponse.setHeader(strHeaderName, objResponseHeaders[strHeaderName]);
		}
	}


	/**
	 * @returns {string}
	 */
	get remoteAddress()
	{
		if(
			this.httpIncomingMessage
			&& (
				typeof this._strRemoteAddress === "undefined"
				|| this._strRemoteAddress === null
			)
		)
		{
			this._strRemoteAddress = this.httpIncomingMessage.socket.remoteAddress;
		}

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
	 * @returns {string}
	 */
	get localAddress()
	{
		if(
			this.httpIncomingMessage
			&& (
				typeof this._strLocalAddress === "undefined"
				|| this._strLocalAddress === null
			)
		)
		{
			this._strLocalAddress = this.httpIncomingMessage.socket.localAddress;
		}

		return this._strLocalAddress;
	}


	/**
	 * @param {string} strLocalAddress
	 */
	set localAddress(strLocalAddress)
	{
		this._strLocalAddress = strLocalAddress;
	}


	/**
	 * Sets "location" header in the extra response headers.
	 * For redirect HTTP status code the default is 307 - Temporary Redirect.
	 * Warning! Without the status code set to 3xx, browsers do not make the redirect
	 *
	 * @param {string} strRedirectURL
	 * @param {Integer} nRedirectHTTPStatusCode
	 */
	setRedirectURL(strRedirectURL, nRedirectHTTPStatusCode = 307 /*Temporary Redirect*/)
	{
		if(strRedirectURL.includes("\n\t\r"))
		{
			throw new TypeError(`Invalid redirect URL ${JSON.stringify(strRedirectURL)}`);
		}

		assert(
			Number.isInteger(nRedirectHTTPStatusCode) && nRedirectHTTPStatusCode >= 300 && nRedirectHTTPStatusCode <= 399,
			`Invalid redirect HTTP status code. Expected a number between 300 and 399, but got ${JSON.stringify(nRedirectHTTPStatusCode)}.`
		);

		//Validate URL
		const redirectURL = new URL(strRedirectURL);
		this.addHTTPResponseHeaders({
			"location": redirectURL.toString()
		});

		this.httpServerResponse.statusCode = nRedirectHTTPStatusCode;
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
				message: this.callResult.message + (this.stackInErrorMessage ? " " + this.callResult.stack : ""),
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
