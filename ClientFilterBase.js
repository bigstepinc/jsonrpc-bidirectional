"use strict";

/*
* TODO:
* Comments to JSDOC3
* */

var JSONRPC=JSONRPC || {};

JSONRPC.ClientFilterBase=class
{
	constructor()
	{

	}

	/**
	 * Should be used to
	 * - add extra request object keys;
	 * - translate or encode output params into the expected server request object format.
	 * objFilterParams allows for reference return for multiple params. It contains:
	 * @param array arrRequest.
	 */
	beforeJSONEncode(objFilterParams)
	{

	}

	/**
	 * Should be used to
	 * - encrypt, encode or otherwise prepare the JSON request string into the expected server input format;
	 * - log raw output.
	 * objFilterParams allows for reference return for multiple params. It contains:
	 * @param string strJSONRequest.
	 * @param string strEndpointURL.
	 * @param string arrHTTPHeaders.
	 */
	afterJSONEncode(objFilterParams)
	{

	}

	/**
	 * First plugin to make a request will be the last one. The respective plugin MUST set bCalled to true.
	 * objFilterParams allows for reference return for multiple params. It contains:
	 * @return mixed. The RAW string output of the server or false on error (or can throw).
	 */
	makeRequest(objFilterParams)
	{
		return null;
	}

	/**
	 * Should be used to
	 * - decrypt, decode or otherwise prepare the JSON response into the expected JSON-RPC client format;
	 * - log raw input.
	 * objFilterParams allows for reference return for multiple params. It contains:
	 * @param string strJSONResponse.
	 */
	beforeJSONDecode(objFilterParams)
	{

	}

	/**
	 * Should be used to
	 * - add extra response object keys;
	 * - translate or decode response params into the expected JSON-RPC client response object format.
	 * objFilterParams allows for reference return for multiple params. It contains:
	 * @param array arrResponse.
	 */
	afterJSONDecode(objFilterParams)
	{

	}

	/**
	 * Should be used to rethrow exceptions as different types.
	 * The first plugin to throw an exception will be the last one.
	 * If there are no filter plugins registered or none of the plugins have thrown an exception,
	 * then JSONRPC_client will throw the original JSONRPC_Exception.
	 * @param Error exception.
	 */
	exceptionCatch(exception)
	{

	}
};