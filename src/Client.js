const JSONRPC = {};
JSONRPC.Exception = require("./Exception");

JSONRPC.Plugins = {};
JSONRPC.Plugins.Client = require("./Plugins/Client/index");

const fetch = require("node-fetch");
const Request = fetch.Request;
const Headers = fetch.Headers;

const assert = require("assert");

/**
 * Class representing the JSONRPC Client.
 * @class
 */
module.exports =
class Client
{
	/**
	 * @param {string} strJSONRPCRouterURL
	 */
	constructor(strJSONRPCRouterURL)
	{
		this._arrFilterPlugins = [];
		this._strJSONRPCRouterURL = strJSONRPCRouterURL;
	}

	/**
	 * This is the function used to set the HTTP credentials.
	 * 
	 * @param {string} strUsername
	 * @param {string} strPassword
	 */
	setHTTPCredentials(strUsername, strPassword)
	{
		this._strHTTPUser = strUsername;
		this._strHTTPPassword = strPassword;
	}

	/**
	 * Function used to send the JSONRPC request.
	 * 
	 * @param {string} strFunctionName
	 * @param {Array} arrParams
	 */
	async rpc(strFunctionName, arrParams)
	{
		assert(Array.isArray(arrParams), "arrParams must be an Array.");

		const objFilterParams = {};
		
		objFilterParams.objRequest = {
			"method": strFunctionName,
			"params": arrParams,

			"id": Client.callID,
			"jsonrpc": Client.JSONRPC_VERSION
		};

		Client._nCallID++;

		for(let i = 0; i < this._arrPlugins.length; i++)
		{
			this._arrPlugins[i].beforeJSONEncode(objFilterParams);
		}

		objFilterParams.nCallID = Client.nCallID;
		objFilterParams.strJSONRequest = JSON.stringify(objFilterParams.objRequest, null, "\t");
		delete objFilterParams.objRequest;
		objFilterParams.strEndpointURL = this.jsonrpcRouterURL;
		objFilterParams.objHTTPHeaders = {
			"Content-type": "application/json"
		};

		if(this.httpUser !== null && this.httpPassword !== null)
		{
			objFilterParams.objHTTPHeaders["Authorization"] = "Basic " + this.httpUser + ":" + this.httpPassword;
		}

		for(let i = 0; i < this._arrPlugins.length; i++)
		{
			this._arrPlugins[i].afterJSONEncode(objFilterParams);
		}

		let bErrorMode = false;
		let strResult = null;
		objFilterParams.bCalled = false;
		for(let i = 0; i < this._arrPlugins.length; i++)
		{
			strResult = await this._arrPlugins[i].makeRequest(objFilterParams);
			if(objFilterParams.bCalled)
			{
				if(strResult !== null)
				{
					return strResult;
				}

				break;
			}
			else if(strResult !== null)
			{
				throw new Error("Plugin set return value to non-null while leaving bCalled===false.");
			}
		}

		if(!objFilterParams.bCalled)
		{
			const request = new Request(
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

			const response = await fetch(request);
			let strResult = await response.text();

			if(!response.ok)
			{
				bErrorMode = true;
				if(parseInt(response.status, 10) === 0)
				{
					strResult = JSON.stringify({
						"jsonrpc": Client.JSONRPC_VERSION,
						"error": {
							"code": JSONRPC.Exception.NETWORK_ERROR,
							"message": "Network error. The internet connection may have failed."
						},
						"id": objFilterParams.nCallID
					});
				}
			}

			return await this.processRAWResponse(strResult, bErrorMode);
		}
	}

	/**
	 * Decodes a JSON response, returns the result or throws an Error.
	 * @param {string} strResult
	 * @param {boolean} bErrorMode
	 */
	async processRAWResponse(strResult, bErrorMode)
	{
		try
		{
			const objFilterParams = {};

			objFilterParams.strResult = strResult;
			for(let i = 0; i < this._arrPlugins.length; i++)
			{
				this._arrPlugins[i].beforeJSONDecode(objFilterParams);
			}

			let objResponse;
			try
			{
				objResponse = JSON.parse(objFilterParams.strResult);
			}
			catch(error)
			{
				throw new JSONRPC.Exception("JSON parsing failed. RAW response: " + objFilterParams.strResult, JSONRPC.Exception.PARSE_ERROR);
			}

			delete objFilterParams.strResult;
			objFilterParams.objResponse = objResponse;
			for(let i = 0; i < this._arrPlugins.length; i++)
			{
				this._arrPlugins[i].afterJSONDecode(objFilterParams);
			}

			// Maybe it wasn't an object before calling filters, so maybe it wasn't passed by reference.
			objResponse = objFilterParams.objResponse;

			if((typeof objResponse !== "object") || (bErrorMode && !objResponse.hasOwnProperty("error")))
			{
				throw new JSONRPC.Exception(JSON.stringify("Invalid response structure. RAW response: " + strResult), JSONRPC.Exception.PARSE_ERROR);
			}
			else if(objResponse.hasOwnProperty("result") && !objResponse.hasOwnProperty("error") && !bErrorMode)
			{
				return objResponse.result;
			}

			throw new JSONRPC.Exception(objResponse.error.message, objResponse.error.code);
		}
		catch(error)
		{
			for (let i = this._arrPlugins.length - 1; i >= 0; i--)
			{
				this._arrPlugins[i].exceptionCatch(error);
			}

			throw error;
		}
	}


	/**
	 * Adds a plugin.
	 * @param {Object} plugin
	 */
	addPlugin(plugin)
	{
		if(this._arrPlugins.includes(plugin))
		{
			return;
		}

		this._arrPlugins.push(plugin);
	}


	/**
	 * Removes a plugin.
	 * @param {Object} plugin
	 */
	removePlugin(plugin)
	{
		if(!this._arrPlugins.includes(plugin))
		{
			return;
		}

		this._arrPlugins.splice(this._arrPlugins.findIndex(plugin), 1);
	}


	/**
	 *
	 */
	rpcFunctions()
	{
		return this.rpc("rpc.functions", [].slice.call(arguments));
	}

	/**
	 * @param {string} strFunctionName
	 */
	rpcReflectionFunction(strFunctionName)
	{
		return this.rpc("rpc.reflectionFunction", [].slice.call(arguments));
	}

	/**
	 * @param {Array} arrFunctionNames
	 */
	rpcReflectionFunctions(arrFunctionNames)
	{
		return this.rpc("rpc.reflectionFunctions", [].slice.call(arguments));
	}

	/**
	 *
	 */
	rpcAllowedCrossSiteXHRSubdomains()
	{
		return this.rpc("rpc.allowedCrossSiteXHRSubdomains", [].slice.call(arguments));
	}

	/**
	 * Enables logging.
	 */
	enableLogging()
	{
		if(!this._consoleLoggerPlugin)
		{
			this._consoleLoggerPlugin = new JSONRPC.Plugins.Client.DebugLogger();
		}
		
		this.addPlugin(this._consoleLoggerPlugin);
	}

	/**
	 * Disables logging.
	 */
	disableLogging()
	{
		if(this._consoleLoggerPlugin)
		{
			this.removePlugin(this._consoleLoggerPlugin);
		}
		else
		{
			throw new Error("Failed to remove ConsoleLogger plugin object, maybe plugin is not registered.");
		}
	}

	/**
	 * JSON-RPC server endpoint URL.
	 *
	 * @returns {string|null} _strJSONRPCRouterURL
	 */
	get jsonrpcRouterURL()
	{
		return this._strJSONRPCRouterURL || null;
	}

	/**
	 * Filter plugins which extend JSONRPC.ClientPluginBase.
	 *
	 * @returns {Array|null} _arrFilterPlugins
	 */
	get _arrPlugins()
	{
		return this._arrFilterPlugins || null;
	}

	/**
	 * JSON-RPC protocol call ID.
	 *
	 * @returns {number}
	 */
	static get callID()
	{
		if(Client._nCallID === undefined)
		{
			Client._nCallID = 1;
		}

		return Client._nCallID;
	}

	/**
	 * The user name part of HTTP credentials used for authentication plugins.
	 *
	 * @returns {string|null} _strHTTPUser
	 */
	get httpUser()
	{
		return this._strHTTPUser || null;
	}

	/**
	 * The user password part of HTTP credentials used for authentication plugins.
	 * @returns {string|null} _strHTTPPassword
	 */
	get httpPassword()
	{
		return this._strHTTPPassword || null;
	}

	/**
	 * @returns {string}
	 */
	static get JSONRPC_VERSION()
	{
		return "2.0";
	}
};
