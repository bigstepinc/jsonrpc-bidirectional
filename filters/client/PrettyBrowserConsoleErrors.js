"use strict";

/**
 * JSONRPC_Filter_Client namespace.
 * @namespace
 */
var JSONRPC_Filter_Client=JSONRPC_Filter_Client || {};

/**
 * PrettyBrowserConsoleErrors plugin.
 * @class
 * @extends JSONRPC.ClientFilterBase
 */
JSONRPC_Filter_Client.PrettyBrowserConsoleErrors=class extends JSONRPC.ClientFilterBase
{
	/**
  	 * Catches the exception and prints it.
  	 * @param {error} exception
	 */
	exceptionCatch(exception)
	{
		if(exception instanceof JSONRPC.JSONRPC_Exception)
		{
			console.log("%c" + exception, "color: red");
			console.log("%c JSONRPC_Exception: " + JSON.stringify(exception, null, 4), "color: red")
		}
	}
};

