"use strict";

/**
 * Class representing the base for the client filters.
 * @class
 */
module.exports=
class ClientFilterBase
{
	/**
	 * Should be used to
	 * - add extra request object keys;
	 * - translate or encode output params into the expected server request object format.
	 * @param {Object} objFilterParams - It allows for reference return for multiple params. It contains:
	 * {Object} objRequest
	 */
	beforeJSONEncode(objFilterParams)
	{

	}

	/**
	 * Should be used to
	 * - encrypt, encode or otherwise prepare the JSON request string into the expected server input format;
	 * - log raw output.
	 * @param {Object} objFilterParams - It allows for reference return for multiple params. It contains:
	 * {String} strJSONRequest
	 * {String} strEndpointURL
	 * {Array} arrHTTPHeaders
	 */
	afterJSONEncode(objFilterParams)
	{

	}

	/**
	 * First plugin to make a request will be the last one. The respective plugin MUST set bCalled to true.
	 * @param {Object} objFilterParams - It allows for reference return for multiple params.
	 * @returns {*}. The RAW string output of the server or false on error (or can throw)
	 */
	makeRequest(objFilterParams)
	{
		return null;
	}

	/**
	 * Should be used to
	 * - decrypt, decode or otherwise prepare the JSON response into the expected JSON-RPC client format;
	 * - log raw input.
	 * @param {Object} objFilterParams - It allows for reference return for multiple params. It contains:
	 * {string} strJSONResponse
	 */
	beforeJSONDecode(objFilterParams)
	{

	}

	/**
	 * Should be used to
	 * - add extra response object keys;
	 * - translate or decode response params into the expected JSON-RPC client response object format.
	 * @param {Object} objFilterParams - It allows for reference return for multiple params. It contains:
	 * {Object} objResponse
	 */
	afterJSONDecode(objFilterParams)
	{

	}

	/**
	 * Should be used to rethrow exceptions as different types.
	 * The first plugin to throw an exception will be the last one.
	 * If there are no filter plugins registered or none of the plugins have thrown an exception,
	 * then JSONRPC_client will throw the original JSONRPC_Exception.
	 * @param {error} exception
	 */
	exceptionCatch(exception)
	{

	}
};