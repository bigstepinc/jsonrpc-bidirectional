"use strict";

/*
* TODO:
* Comments to JSDOC3
* */

var JSONRPC_Filter_Client=JSONRPC_Filter_Client || {};

JSONRPC_Filter_Client.PrettyBrowserConsoleErrors=class extends JSONRPC.ClientFilterBase
{
	constructor()
	{
		super();
	}

	exceptionCatch(exception)
	{
		if(exception instanceof JSONRPC.JSONRPC_Exception)
		{
			console.log("%c" + exception, "color: red");
			console.log("%c JSONRPC_Exception: " + JSON.stringify(exception, null, 4), "color: red")
		}
	}
};

