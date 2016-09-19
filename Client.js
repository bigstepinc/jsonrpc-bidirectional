"use strict";

/**
 * JSONRPC namespace.
 * @namespace
 */
var JSONRPC=JSONRPC || {};

/**
 * Class representing the JSONRPC Client.
 * @class
 */
JSONRPC.Client=class
{
	/**
	 * Helps decouple initialization in constructor from main thread.
	 * Specifically added to enable use of XHR.withCredentials for cross-site requests.
	 * @param {string} strJSONRPCRouterURL
	 * @param {callback} fnReadyCallback
	 * @param {boolean} bWithCredentials
	 */
	constructor(strJSONRPCRouterURL, fnReadyCallback, bWithCredentials)
	{
		// Allows prototype inheritance.
		if(typeof strJSONRPCRouterURL!=="undefined")
		{
			if(typeof bWithCredentials==="undefined")
				this.bWithCredentials=false;
			else
				this.bWithCredentials=!!bWithCredentials;

			if(typeof bWithCredentials==="undefined")
				this.bWithCredentials=false;
			else
				this.bWithCredentials=!!bWithCredentials;

			this._arrFilterPlugins=[];
			this._strJSONRPCRouterURL=strJSONRPCRouterURL;

			if(fnReadyCallback && typeof fnReadyCallback!="function")
				throw new Error("fnReadyCallback must be of type Function.");

			if(fnReadyCallback)
			{
				// Faking asynchronous loading.
				setTimeout(
					function(){
						fnReadyCallback();
					},
					1
				);
			}
		}
	}

	/**
	 * This is the function used to set the HTTP credentials.
	 * @param {string} strUsername
	 * @param {string} strPassword
	 */
	setHTTPCredentials(strUsername, strPassword)
	{
		this._strHTTPUser = strUsername;
		this._strHTTPPassword = strPassword;
	}

	/**
	 * If first element of arrParams is a function, it must be a callback for
	 * making an asynchronous call. The callback will be called with a single response param,
	 * which may be either an Error object (or an Error object subclass) or the actual response.
	 * @protected
	 * @param {string} strFunctionName
	 * @param {array} arrParams
	 */
	_rpc(strFunctionName, arrParams)
	{
		var objFilterParams={};

		var bAsynchronous=false;
		var fnAsynchronous;
		if(arrParams.length && (typeof arrParams[0]=="function"))
		{
			fnAsynchronous=arrParams.shift();
			bAsynchronous=true;
		}

		objFilterParams.objRequest={
			"method": strFunctionName,
			"params": arrParams,

			"id": ++this._nCallID,
			"jsonrpc": JSONRPC.Client.JSONRPC_VERSION
		};

		for(var i=0; i<this._arrFilterPlugins.length; i++)
			this._arrFilterPlugins[i].beforeJSONEncode(objFilterParams, bAsynchronous);

		objFilterParams.strJSONRequest=JSON.stringify(objFilterParams.objRequest, null, "\t");
		delete objFilterParams.objRequest;
		objFilterParams.strEndpointURL=this._strJSONRPCRouterURL;
		objFilterParams.objHTTPHeaders={
			"Content-type": "application/json"
		};

		if(this._strHTTPUser!=null && this._strHTTPPassword!=null)
			objFilterParams.objHTTPHeaders["Authorization"] = "Basic " + this._strHTTPUser + ":" + this._strHTTPPassword;

		for(i=0; i<this._arrFilterPlugins.length; i++)
			this._arrFilterPlugins[i].afterJSONEncode(objFilterParams);

		var bErrorMode=false;
		var strResult=null;
		objFilterParams.bCalled=false;
		objFilterParams.bAsynchronous=bAsynchronous;
		objFilterParams.fnAsynchronous=fnAsynchronous;
		for(i=0; i<this._arrFilterPlugins.length; i++)
		{
			strResult=this._arrFilterPlugins[i].makeRequest(objFilterParams);
			if(objFilterParams.bCalled)
			{
				if(bAsynchronous && strResult!==null)
					throw new Error("Plugin set return value to non-null for an asynchronous request.");
				break;
			}
			if(strResult!==null)
				throw new Error("Plugin set return value to non-null while leaving bCalled===false.");
		}

		if(!objFilterParams.bCalled)
		{
			var xmlhttp=new XMLHttpRequest();

			var _self=this;

			xmlhttp.onreadystatechange=function(){
				// DONE, the operation is complete.
				if(xmlhttp.readyState==4)
				{
					if(xmlhttp.status!=200)
					{
						bErrorMode=true;
					}
					strResult=xmlhttp.responseText;

					if(
						parseInt(xmlhttp.status)===0
					// && !String(strResult).length
					)
					{
						strResult=JSON.stringify({
							"jsonrpc": JSONRPC.Client.JSONRPC_VERSION,
							"error": {
								"code": JSONRPC.Exception.NETWORK_ERROR,
								"message": "Network error. The internet connection may have failed."
							},
							"id": null
						});
					}

					if(bAsynchronous)
					{
						var mxResponse;
						try
						{
							mxResponse=_self.processRAWResponse(strResult, bErrorMode);
						}
						catch(error)
						{
							mxResponse=error;
						}
						fnAsynchronous(mxResponse);
					}
				}
			};

			xmlhttp.open(
				"post",
				objFilterParams.strEndpointURL,
				!!bAsynchronous
			);


			// Setting withCredentials for synchronous requests is deprecated by W3C and already throws an error in many browsers.
			if(bAsynchronous)
			{
				// In order to force the browser to send cookies for XHR we must set withCredentials.
				// xmlhttp.withCredentials must be set AFTER XMLHttpRequest.open, as per W3C spec. Internet Explorer 10 and 11 will issue a SCRIPT_ERROR.
				if(typeof xmlhttp.withCredentials=="boolean" || xmlhttp.hasOwnProperty("withCredentials"))
					xmlhttp.withCredentials=this.bWithCredentials;
			}

			for(var strHeaderName in objFilterParams.objHTTPHeaders)
				if(objFilterParams.objHTTPHeaders.hasOwnProperty(strHeaderName))
					xmlhttp.setRequestHeader(strHeaderName, objFilterParams.objHTTPHeaders[strHeaderName]);

			xmlhttp.send(objFilterParams.strJSONRequest);
		}

		if(!bAsynchronous)
			return this.processRAWResponse(strResult, bErrorMode);
	}

	/**
	 * Decodes a JSON response, returns the result or throws the Error.
	 * @param {string} strResult
	 * @param {boolean} bErrorMode
	 */
	processRAWResponse(strResult, bErrorMode)
	{
		try
		{
			var objFilterParams={};

			objFilterParams.strResult=strResult;
			for(let i=0; i<this._arrFilterPlugins.length; i++)
				this._arrFilterPlugins[i].beforeJSONDecode(objFilterParams);

			try
			{
				var objResponse=JSON.parse(objFilterParams.strResult);
			}
			catch(error)
			{
				throw new JSONRPC.Exception("JSON parsing failed. RAW response: "+objFilterParams.strResult, JSONRPC.Exception.PARSE_ERROR);
			}

			delete objFilterParams.strResult;
			objFilterParams.objResponse=objResponse;
			for(let i=0; i<this._arrFilterPlugins.length; i++)
				this._arrFilterPlugins[i].afterJSONDecode(objFilterParams);

			// Maybe it wasn't an object before calling filters, so maybe it wasn't passed by reference.
			objResponse=objFilterParams.objResponse;

			if((typeof objResponse!="object") || (bErrorMode && !objResponse.hasOwnProperty("error")))
				throw new JSONRPC.Exception(JSON.stringify("Invalid response structure. RAW response: "+strResult), JSONRPC.Exception.PARSE_ERROR);
			else if(objResponse.hasOwnProperty("result") && !objResponse.hasOwnProperty("error") && !bErrorMode)
				return objResponse.result;

			throw new JSONRPC.Exception(objResponse.error.message, objResponse.error.code);
		}
		catch(error)
		{
			for (let i=this._arrFilterPlugins.length-1; i>=0; i--)
				this._arrFilterPlugins[i].exceptionCatch(error);

			throw error;
		}
	}

	/**
	 * Adds a plugin.
	 * @param {object} objFilterPlugin
	 */
	addFilterPlugin(objFilterPlugin)
	{
		for(let i=0; i<this._arrFilterPlugins.length; i++)
			if(this._arrFilterPlugins[i].constructor===objFilterPlugin.constructor)
				throw new Error("Multiple instances of the same filter are not allowed.");
		this._arrFilterPlugins.push(objFilterPlugin);
	}

	/**
	 * Removes a plugin.
	 * @param {object} objFilterPlugin
	 */
	removeFilterPlugin(objFilterPlugin)
	{
		var nIndex=null;
		for(let i=0; i<this._arrFilterPlugins.length; i++)
			if(this._arrFilterPlugins[i].constructor===objFilterPlugin.constructor)
			{
				nIndex=i;
				break;
			}
		if(nIndex===null)
			throw new Error("Failed to remove filter plugin object, maybe plugin is not registered.");

		this._arrFilterPlugins.splice(nIndex, 1);
	}

	/**
	 *
	 */
	rpcFunctions()
	{
		return this._rpc("rpc.functions", [].slice.call(arguments));
	}

	/**
	 * @param {string} strFunctionName
	 */
	rpcReflectionFunction(strFunctionName)
	{
		return this._rpc("rpc.reflectionFunction", [].slice.call(arguments));
	}

	/**
	 * @param {array} arrFunctionNames
	 */
	rpcReflectionFunctions(arrFunctionNames)
	{
		return this._rpc("rpc.reflectionFunctions", [].slice.call(arguments));
	}

	/**
	 *
	 */
	rpcAllowedCrossSiteXHRSubdomains()
	{
		return this._rpc("rpc.allowedCrossSiteXHRSubdomains", [].slice.call(arguments));
	}

	/**
	 * Enables logging.
	 */
	enableLogging()
	{
		if(this._objConsoleLoggerPlugin)
			this.addFilterPlugin(this._objConsoleLoggerPlugin);
		else
			this._objConsoleLoggerPlugin=this.addFilterPlugin(new DebugLogger());
	}

	/**
	 * Disables logging.
	 */
	disableLogging()
	{
		if(this._objConsoleLoggerPlugin)
			this.removeFilterPlugin(this._objConsoleLoggerPlugin);
		else
			throw new Error("Failed to remove ConsoleLogger plugin object, maybe plugin is not registered.");
	}
};

/**
 * JSON-RPC server endpoint URL
 * @protected
 */
JSONRPC.Client.prototype._strJSONRPCRouterURL=null;

/**
 * Flag to keep cookies for CORS requests.
 * @public
 */
JSONRPC.Client.prototype.bWithCredentials=false;

/**
 * Filter plugins which extend JSONRPC_server_filter_plugin_base.
 * @protected
 */
JSONRPC.Client.prototype._arrFilterPlugins=null;

/**
 * JSON-RPC protocol call ID.
 * @protected
 */
JSONRPC.Client.prototype._nCallID=0;

/**
 * HTTP credentials used for authentication plugins
 */
JSONRPC.Client.prototype._strHTTPUser=null;
JSONRPC.Client.prototype._strHTTPPassword=null;

JSONRPC.Client.JSONRPC_VERSION="2.0";