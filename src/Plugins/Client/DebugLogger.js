"use strict";

const JSONRPC={};
JSONRPC.ClientPluginBase=require("../../ClientPluginBase");
JSONRPC.Utils=require("../../Utils");

/**
 * DebugLogger plugin.
 * @class
 * @extends JSONRPC.ClientPluginBase
 */
module.exports=
class DebugLogger extends JSONRPC.ClientPluginBase
{
	/**
	 * Prints the request in JSON format.
	 * @param {Object} objFilterParams - It allows for reference return for multiple params. It contains:
	 * {String} strJSONRequest
	 * {String} strEndpointURL
	 * {Array} arrHTTPHeaders
	 */
	afterJSONEncode(objFilterParams)
	{
		console.log("Sent request at "+new Date()+"\n"+JSONRPC.Utils.JSONFormat(objFilterParams.strJSONRequest)+"\n");
	}

	/**
	 * Prints the response in JSON format.
	 * @param {Object} objFilterParams - It allows for reference return for multiple params. It contains:
	 * {string} strJSONResponse
	 */
	beforeJSONDecode(objFilterParams)
	{
		console.log("Received response at "+new Date()+"\n"+JSONRPC.Utils.JSONFormat(objFilterParams.strResult)+"\n");
	}
};