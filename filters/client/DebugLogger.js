"use strict";

/**
 * JSONRPC_Filter_Client namespace.
 * @namespace
 */
var JSONRPC_Filter_Client=JSONRPC_Filter_Client || {};

/**
 * DebugLogger plugin.
 * @class
 * @extends JSONRPC.ClientFilterBase
 */
JSONRPC_Filter_Client.DebugLogger=class extends JSONRPC.ClientFilterBase
{
	constructor()
	{
		super();
	}

	/**
	 * Prints the request in JSON format.
	 * objFilterParams allows for reference return for multiple params. It contains:
	 * @param {string} strJSONRequest
	 * @param {string} strEndpointURL
	 * @param {array} arrHTTPHeaders
	 */
	afterJSONEncode(objFilterParams)
	{
		console.log("Sent request at " + new Date() + "\n" + JSONRPC.Utils.JSONFormat(objFilterParams.strJSONRequest) + "\n");
	}

	/**
	 * Prints the response in JSON format.
	 * objFilterParams allows for reference return for multiple params. It contains:
	 * @param {string} strJSONResponse
	 */
	beforeJSONDecode(objFilterParams)
	{
		console.log("Received response at " + new Date() + "\n" + JSONRPC.Utils.JSONFormat(objFilterParams.strResult) + "\n");
	}
};