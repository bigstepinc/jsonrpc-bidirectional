"use strict";

const JSONRPC={};
JSONRPC.ClientPluginBase=require("../../ClientPluginBase");

/**
 * PrettyBrowserConsoleErrors plugin.
 * @class
 * @extends JSONRPC.ClientPluginBase
 */
module.exports=
class PrettyBrowserConsoleErrors extends JSONRPC.ClientPluginBase
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