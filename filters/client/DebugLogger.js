"use strict";

/*
* TODO:
* Comments to JSDOC3
* */

var JSONRPC_Filter_Client=JSONRPC_Filter_Client || {};

JSONRPC_Filter_Client.DebugLogger=class extends JSONRPC.ClientFilterBase
{
	constructor()
	{
		super();
	}

	afterJSONEncode(objFilterParams)
	{
		console.log("Sent request at " + new Date() + "\n" + JSONRPC.Utils.JSONFormat(objFilterParams.strJSONRequest) + "\n");
	}

	beforeJSONDecode(objFilterParams)
	{
		console.log("Received response at " + new Date() + "\n" + JSONRPC.Utils.JSONFormat(objFilterParams.strResult) + "\n");
	}
};