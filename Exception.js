"use strict";

/**
 * JSONRPC namespace.
 * @namespace
 */
var JSONRPC=JSONRPC || {};

/**
 * Class representing the JSONRPC Exceptions.
 * @class
 * @extends Error
 */
JSONRPC.Exception=class extends Error
{
	/**
	 * @param {String} strMessage
	 * @param {Number} nCode
	 */
	constructor(strMessage, nCode)
	{
		super(strMessage);

		this.message=strMessage;
		this.nCode=nCode;
	}
};

JSONRPC.Exception.prototype.message=null;
JSONRPC.Exception.prototype.nCode=null;

/**
 * Bad credentials (user, password, signing hash, account does not exist, etc.).
 * Not part of JSON-RPC 2.0 spec.
 */
JSONRPC.Exception.NOT_AUTHENTICATED=-1;

/**
 * The authenticated user is not authorized to make any or some requests.
 * Not part of JSON-RPC 2.0 spec.
 */
JSONRPC.Exception.NOT_AUTHORIZED=-2;

/**
 * The request has expired. The requester must create or obtain a new request.
 * Not part of JSON-RPC 2.0 spec.
 */
JSONRPC.Exception.REQUEST_EXPIRED=-3;

/**
 * Did not receive a proper response from the server.
 * On HTTP, a HTTP response code was not received.
 * Not part of JSON-RPC 2.0 spec.
 */
JSONRPC.Exception.NETWORK_ERROR=-4;

/**
 * Parse error.
 * Invalid JSON was received by the server.
 * An error occurred on the server while parsing the JSON text.
 */
JSONRPC.Exception.PARSE_ERROR=-32700;

/**
 * Invalid Request.
 * The JSON sent is not a valid Request object.
 */
JSONRPC.Exception.INVALID_REQUEST=-32600;

/**
 * Method not found.
 * The method does not exist / is not available.
 */
JSONRPC.Exception.METHOD_NOT_FOUND=-32601;

/**
 * Invalid params.
 * Invalid method parameter(s).
 */
JSONRPC.Exception.INVALID_PARAMS=-32602;

/**
 * Internal error.
 * Internal JSON-RPC error.
 */
JSONRPC.Exception.INTERNAL_ERROR=-32603;

/**
 * Invalid method return type.
 */
JSONRPC.Exception.INVALID_RETURN_TYPE=-32604;

// -32000 to -32099 Server error. Reserved for implementation-defined server-errors.