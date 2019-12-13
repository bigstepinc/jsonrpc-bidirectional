const assert = require("assert");

const ExtendableError = require("extendable-error-class");


module.exports =
class Exception extends ExtendableError
{
	/**
	 * @param {string} strMessage
	 * @param {number} nCode
	 * @param {object} objData
	 */
	constructor(strMessage, nCode = 0, objData = {})
	{
		super(strMessage);

		this.strMessage = strMessage;
		this.code = (nCode === undefined || nCode === null) ? 0 : nCode;
		
		// Do not use the setter as it only allows an Object (validates), 
		// while the JSONRPC 2.0 specification only requires a "structured" data type.
		this.objData = objData;
	}


	/**
	 * @returns {number}
	 */
	get code()
	{
		return this.nCode;
	}


	/**
	 * @param {number} nCode
	 */
	set code(nCode)
	{
		assert(typeof nCode === "number" || String(parseInt(nCode)) === nCode, "The JSONRPC.Exception error code must be of type number.");
		this.nCode = parseInt(nCode);
	}


	/**
	 * @returns {object}
	 */
	get data()
	{
		return this.objData;
	}


	/**
	 * @param {object} objData
	 */
	set data(objData)
	{
		assert(typeof objData === "object" && objData !== null, "The JSONRPC.Exception data property must be an Object.");
		this.objData = objData;
	}


	/**
	 * Bad credentials (user, password, signing hash, account does not exist, etc.).
	 * Not part of JSON-RPC 2.0 spec.
	 *
	 * @returns {number}
	 */
	static get NOT_AUTHENTICATED()
	{
		return -1;
	}

	/**
	 * The authenticated user is not authorized to make any or some requests.
	 * Not part of JSON-RPC 2.0 spec.
	 *
	 * @returns {number}
	 */
	static get NOT_AUTHORIZED()
	{
		return -2;
	}

	/**
	 * The request has expired. The requester must create or obtain a new request.
	 * Not part of JSON-RPC 2.0 spec.
	 *
	 * @returns {number}
	 */
	static get REQUEST_EXPIRED()
	{
		return -3;
	}

	/**
	 * Did not receive a proper response from the server.
	 * On HTTP, a HTTP response code was not received.
	 * Not part of JSON-RPC 2.0 spec.
	 *
	 * @returns {number}
	 */
	static get NETWORK_ERROR()
	{
		return -4;
	}

	/**
	 * Parse error.
	 * Invalid JSON was received by the server.
	 * An error occurred on the server while parsing the JSON text.
	 *
	 * @returns {number}
	 */
	static get PARSE_ERROR()
	{
		return -32700;
	}

	/**
	 * Invalid Request.
	 * The JSON sent is not a valid Request object.
	 *
	 * @returns {number}
	 */
	static get INVALID_REQUEST()
	{
		return -32600;
	}

	/**
	 * Method not found.
	 * The method does not exist / is not available.
	 *
	 * @returns {number}
	 */
	static get METHOD_NOT_FOUND()
	{
		return -32601;
	}

	/**
	 * Invalid params.
	 * Invalid method parameter(s).
	 *
	 * @returns {number}
	 */
	static get INVALID_PARAMS()
	{
		return -32602;
	}

	/**
	 * Internal error.
	 * Internal JSON-RPC error.
	 *
	 * @returns {number}
	 */
	static get INTERNAL_ERROR()
	{
		return -32603;
	}

	// -32000 to -32099 Server error. Reserved for implementation-defined server-errors.
};
