"use strict";

/*
* TODO:
* Comments to JSDOC3
* */

var JSONRPC=JSONRPC || {};

JSONRPC.JSONRPC_Exception=class extends Error
{
	constructor(strMessage, nCode)
	{
		super(strMessage);

		this.message=strMessage;
		this.nCode=nCode;
	}
};

JSONRPC.JSONRPC_Exception.prototype.message=null;
JSONRPC.JSONRPC_Exception.prototype.nCode=null;

/**
 * Bad credentials (user, password, signing hash, account does not exist, etc.).
 * Not part of JSON-RPC 2.0 spec.
 */
JSONRPC.JSONRPC_Exception.NOT_AUTHENTICATED=-1;

/**
 * The authenticated user is not authorized to make any or some requests.
 * Not part of JSON-RPC 2.0 spec.
 */
JSONRPC.JSONRPC_Exception.NOT_AUTHORIZED=-2;

/**
 * The request has expired. The requester must create or obtain a new request.
 * Not part of JSON-RPC 2.0 spec.
 */
JSONRPC.JSONRPC_Exception.REQUEST_EXPIRED=-3;

/**
 * Did not receive a proper response from the server.
 * On HTTP, a HTTP response code was not received.
 * Not part of JSON-RPC 2.0 spec.
 */
JSONRPC.JSONRPC_Exception.NETWORK_ERROR=-4;

/**
 * Parse error.
 * Invalid JSON was received by the server.
 * An error occurred on the server while parsing the JSON text.
 */
JSONRPC.JSONRPC_Exception.PARSE_ERROR=-32700;

/**
 * Invalid Request.
 * The JSON sent is not a valid Request object.
 */
JSONRPC.JSONRPC_Exception.INVALID_REQUEST=-32600;

/**
 * Method not found.
 * The method does not exist / is not available.
 */
JSONRPC.JSONRPC_Exception.METHOD_NOT_FOUND=-32601;

/**
 * Invalid params.
 * Invalid method parameter(s).
 */
JSONRPC.JSONRPC_Exception.INVALID_PARAMS=-32602;

/**
 * Internal error.
 * Internal JSON-RPC error.
 */
JSONRPC.JSONRPC_Exception.INTERNAL_ERROR=-32603;

/**
 * Invalid method return type.
 */
JSONRPC.JSONRPC_Exception.INVALID_RETURN_TYPE=-32604;

//-32000 to -32099 Server error. Reserved for implementation-defined server-errors.