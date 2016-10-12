"use strict";

/**
 * JSONRPC.Filter.Client namespace.
 * @namespace
 */
var JSONRPC=JSONRPC || {};
JSONRPC.Filter=JSONRPC.Filter || {};
JSONRPC.Filter.Client=JSONRPC.Filter.Client || {};

/**
 * PrettyBrowserConsoleErrors plugin.
 * @class
 * @extends JSONRPC.ClientFilterBase
 */
JSONRPC.Filter.Client.PrettyBrowserConsoleErrors=class extends JSONRPC.ClientFilterBase
{
	/**
  	 * Catches the exception and prints it.
  	 * @param {error} exception
	 */
	exceptionCatch(exception)
	{
		if(exception instanceof JSONRPC.Exception)
		{
			console.log("%c"+exception, "color: red");
			console.log("%c JSONRPC_Exception: "+JSON.stringify(exception, null, 4), "color: red")
		}
	}
};