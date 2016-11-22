"use strict";

const JSONRPC={};
JSONRPC.Exception=require("./Exception");

const fetch=require("node-fetch");
const Request=fetch.Request;
const Headers=fetch.Headers;

/**
 * Class representing the JSONRPC Client.
 * @class
 */
module.exports=
class Client
{
	/**
	 * @param {String} strJSONRPCRouterURL
	 * @param {Function} fnReadyCallback
	 * @param {Boolean} bWithCredentials
	 */
	constructor(strJSONRPCRouterURL, fnReadyCallback, bWithCredentials)
	{
		if(strJSONRPCRouterURL!==undefined)
		{
			if(bWithCredentials===undefined)
				this.bWithCredentials=false;
			else
				this.bWithCredentials=!!bWithCredentials;

			this._arrFilterPlugins=[];
			this._strJSONRPCRouterURL=strJSONRPCRouterURL;
			this._nCallID=0;

			if(fnReadyCallback && typeof fnReadyCallback!=="function")
				throw new Error("fnReadyCallback must be of type function.");

			if(fnReadyCallback)
			{
				// Faking asynchronous loading.
				setTimeout(()=>{
						fnReadyCallback();
					},
					1);
			}
		}
	}

	/**
	 * This is the function used to set the HTTP credentials.
	 * @param {String} strUsername
	 * @param {String} strPassword
	 */
	setHTTPCredentials(strUsername, strPassword)
	{
		this._strHTTPUser=strUsername;
		this._strHTTPPassword=strPassword;
	}

	/**
	 * If first element of arrParams is a function, it must be a callback for
	 * making an asynchronous call. The callback will be called with a single response param,
	 * which may be either an Error object (or an Error object subclass) or the actual response.
	 * @protected
	 * @param {String} strFunctionName
	 * @param {Array} arrParams
	 */
	async _rpc(strFunctionName, arrParams)
	{
		const objFilterParams={};

		let bAsynchronous=false;
		let fnAsynchronous;
		if(arrParams.length && typeof arrParams[0]==="function")
		{
			fnAsynchronous=arrParams.shift();
			bAsynchronous=true;
		}

		objFilterParams.objRequest={
			"method": strFunctionName,
			"params": arrParams,

			"id": ++this._nCallID,
			"jsonrpc": Client.JSONRPC_VERSION
		};

		for(let i=0; i<this.arrFilterPlugins.length; i++)
			this.arrFilterPlugins[i].beforeJSONEncode(objFilterParams, bAsynchronous);

		objFilterParams.strJSONRequest=JSON.stringify(objFilterParams.objRequest, null, "\t");
		delete objFilterParams.objRequest;
		objFilterParams.strEndpointURL=this.strJSONRPCRouterURL;
		objFilterParams.objHTTPHeaders={
			"Content-type": "application/json"
		};

		if(this.strHTTPUser!==null && this.strHTTPPassword!==null)
			objFilterParams.objHTTPHeaders["Authorization"]="Basic "+this.strHTTPUser+":"+this.strHTTPPassword;

		for(let i=0; i<this.arrFilterPlugins.length; i++)
			this.arrFilterPlugins[i].afterJSONEncode(objFilterParams);

		let bErrorMode=false;
		let strResult=null;
		objFilterParams.bCalled=false;
		objFilterParams.bAsynchronous=bAsynchronous;
		objFilterParams.fnAsynchronous=fnAsynchronous;
		for(let i=0; i<this.arrFilterPlugins.length; i++)
		{
			strResult=this.arrFilterPlugins[i].makeRequest(objFilterParams);
			if(objFilterParams.bCalled)
			{
				if(bAsynchronous && strResult!==null)
				{
					return strResult;
				}

				break;
			}
			else if(strResult!==null)
			{
				throw new Error("Plugin set return value to non-null while leaving bCalled===false.");
			}
		}

		if(!objFilterParams.bCalled)
		{
			const request=new Request(
				objFilterParams.strEndpointURL,
				{
					method: "POST",
					mode: "cors",
					headers: new Headers(objFilterParams.objHTTPHeaders),
					body: objFilterParams.strJSONRequest,
					cache: "no-cache",
					credentials: "include"
				}
			);

			const response=await fetch(request);
			let strResult=await response.text();

			if(response.status!=200)
			{
				bErrorMode=true;
				if(parseInt(response.status)===0)
				{
					strResult=JSON.stringify({
						"jsonrpc": Client.JSONRPC_VERSION,
						"error": {
							"code": JSONRPC.Exception.NETWORK_ERROR,
							"message": "Network error. The internet connection may have failed."
						},
						"id": null
					});
				}
			}

			if(bAsynchronous)
			{
				await this.processRAWResponse(strResult, bErrorMode)
					.catch((error) => {
						fnAsynchronous(error);
					})
					.then((mxResult)=> {
						fnAsynchronous(mxResult);
					});
			}
			else
			{
				return this.processRAWResponse(strResult, bErrorMode);
			}
		}
	}

	/**
	 * Decodes a JSON response, returns the result or throws an Error.
	 * @param {String} strResult
	 * @param {Boolean} bErrorMode
	 */
	async processRAWResponse(strResult, bErrorMode)
	{
		try
		{
			const objFilterParams={};

			objFilterParams.strResult=strResult;
			for(let i=0; i<this.arrFilterPlugins.length; i++)
				this.arrFilterPlugins[i].beforeJSONDecode(objFilterParams);

			let objResponse;
			try
			{
				objResponse=JSON.parse(objFilterParams.strResult);
			}
			catch(error)
			{
				throw new JSONRPC.Exception("JSON parsing failed. RAW response: "+objFilterParams.strResult, JSONRPC.Exception.PARSE_ERROR);
			}

			delete objFilterParams.strResult;
			objFilterParams.objResponse=objResponse;
			for(let i=0; i<this.arrFilterPlugins.length; i++)
				this.arrFilterPlugins[i].afterJSONDecode(objFilterParams);

			// Maybe it wasn't an object before calling filters, so maybe it wasn't passed by reference.
			objResponse=objFilterParams.objResponse;

			if((typeof objResponse!=="object") || (bErrorMode && !objResponse.hasOwnProperty("error")))
				throw new JSONRPC.Exception(JSON.stringify("Invalid response structure. RAW response: "+strResult), JSONRPC.Exception.PARSE_ERROR);
			else if(objResponse.hasOwnProperty("result") && !objResponse.hasOwnProperty("error") && !bErrorMode)
				return objResponse.result;

			throw new JSONRPC.Exception(objResponse.error.message, objResponse.error.code);
		}
		catch(error)
		{
			for (let i=this.arrFilterPlugins.length-1; i>=0; i--)
				this.arrFilterPlugins[i].exceptionCatch(error);

			throw error;
		}
	}

	/**
	 * Adds a plugin.
	 * @param {Object} objFilterPlugin
	 */
	addFilterPlugin(objFilterPlugin)
	{
		for(let i=0; i<this.arrFilterPlugins.length; i++)
		{
			if(this.arrFilterPlugins[i].constructor===objFilterPlugin.constructor)
			{
				throw new Error("Multiple instances of the same filter are not allowed.");
			}
		}

		this.arrFilterPlugins.push(objFilterPlugin);
	}

	/**
	 * Removes a plugin.
	 * @param {Object} objFilterPlugin
	 */
	removeFilterPlugin(objFilterPlugin)
	{
		let nIndex=null;

		for(let i=0; i<this.arrFilterPlugins.length; i++)
		{
			if(this.arrFilterPlugins[i].constructor===objFilterPlugin.constructor)
			{
				nIndex=i;
				break;
			}
		}

		if(nIndex===null)
		{
			throw new Error("Failed to remove filter plugin object, maybe plugin is not registered.");
		}

		this.arrFilterPlugins.splice(nIndex, 1);
	}

	/**
	 *
	 */
	rpcFunctions()
	{
		return this._rpc("rpc.functions", [].slice.call(arguments));
	}

	/**
	 * @param {String} strFunctionName
	 */
	rpcReflectionFunction(strFunctionName)
	{
		return this._rpc("rpc.reflectionFunction", [].slice.call(arguments));
	}

	/**
	 * @param {Array} arrFunctionNames
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
			this._objConsoleLoggerPlugin=this.addFilterPlugin(new JSONRPC.Filter.Client.DebugLogger());
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

	/**
	 * JSON-RPC server endpoint URL.
	 *
	 * @returns {String|null} _strJSONRPCRouterURL
	 */
	get strJSONRPCRouterURL()
	{
		return this._strJSONRPCRouterURL || null;
	}

	/**
	 * Flag to keep cookies for CORS requests.
	 *
	 * @returns {Boolean} _bWithCredentials
	 */
	get bWithCredentials()
	{
		return this._bWithCredentials || false;
	}

	/**
	 * @param {Boolean} bWithCredentials
	 */
	set bWithCredentials(bWithCredentials)
	{
		this._bWithCredentials=bWithCredentials;
	}

	/**
	 * Filter plugins which extend JSONRPC.ClientFilterBase.
	 *
	 * @returns {Array|null} _arrFilterPlugins
	 */
	get arrFilterPlugins()
	{
		return this._arrFilterPlugins || null;
	}

	/**
	 * JSON-RPC protocol call ID.
	 *
	 * @returns {Number|0} _nCallID
	 */
	get nCallID()
	{
		return this._nCallID || 0;
	}

	/**
	 * The user name part of HTTP credentials used for authentication plugins.
	 *
	 * @returns {String|null} _strHTTPUser
	 */
	get strHTTPUser()
	{
		return this._strHTTPUser || null;
	}

	/**
	 * The user password part of HTTP credentials used for authentication plugins.
	 * @returns {String|null} _strHTTPPassword
	 */
	get strHTTPPassword()
	{
		return this._strHTTPPassword || null;
	}

	/**
	 * @returns {String}
	 */
	static get JSONRPC_VERSION()
	{
		return "2.0";
	}
};