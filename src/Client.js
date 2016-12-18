const url = require("url");

const WebSocket = require("ws");

const JSONRPC = {};
JSONRPC.Exception = require("./Exception");

JSONRPC.Plugins = {};
JSONRPC.Plugins.Client = require("./Plugins/Client/index");
JSONRPC.Utils = require("./Utils");
JSONRPC.OutgoingRequest = require("./OutgoingRequest");

const EventEmitter = require("events");

const fetch = require("node-fetch");
const Request = fetch.Request;
const Headers = fetch.Headers;

const assert = require("assert");


/**
 * 
 */
module.exports =
class Client extends EventEmitter
{
	/**
	 * @param {string} strEndpointURL
	 */
	constructor(strEndpointURL)
	{
		super();

		this._arrPlugins = [];
		this._strJSONRPCEndpointURL = strEndpointURL;
		this._nCallID = 1;
		this._strHTTPUser = null;
		this._strHTTPPassword = null;

		const strProtocol = url.parse(strEndpointURL).protocol;

		if(strProtocol === "http:" || strProtocol === "https:")
		{
			// Embedded support.
		}
		else if(strProtocol === "ws:" || strProtocol === "wss:")
		{
			// Don't forget to add WebSocketTransport.
		}
		else
		{
			// throw new Error("Unsupported protocol " + JSON.stringify(strProtocol) + ", URL: " + strEndpointURL + ".");
		}
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

		const jsonrpcRequest = new JSONRPC.OutgoingRequest(strFunctionName, arrParams, this._nCallID);
		this._nCallID++;

		try
		{
			jsonrpcRequest.endpointURL = this.endpointURL;
			jsonrpcRequest.headers["Content-type"] = "application/json";

			if(this.httpUser !== null && this.httpPassword !== null)
			{
				jsonrpcRequest.headers["Authorization"] = "Basic " + this.httpUser + ":" + this.httpPassword;
			}


			jsonrpcRequest.requestObject = jsonrpcRequest.toRequestObject();

			this.emit("beforeJSONEncode", jsonrpcRequest);
			for(let plugin of this._arrPlugins)
			{
				await plugin.beforeJSONEncode(jsonrpcRequest);
			}


			jsonrpcRequest.requestBody = JSON.stringify(jsonrpcRequest.requestObject, null, "\t");
			// console.log(jsonrpcRequest.requestObject);
			// console.log(jsonrpcRequest.requestBody);

			this.emit("afterJSONEncode", jsonrpcRequest);
			for(let plugin of this._arrPlugins)
			{
				await plugin.afterJSONEncode(jsonrpcRequest);
			}


			if(!jsonrpcRequest.isMethodCalled)
			{
				this.emit("makeRequest", jsonrpcRequest);
			}
			for(let plugin of this._arrPlugins)
			{
				if(jsonrpcRequest.isMethodCalled)
				{
					break;
				}

				await plugin.makeRequest(jsonrpcRequest);
			}


			let response = null;
			let bHTTPErrorMode = false;
			if(!jsonrpcRequest.isMethodCalled)
			{
				const request = new Request(
					jsonrpcRequest.endpointURL,
					{
						method: "POST",
						mode: "cors",
						headers: new Headers(jsonrpcRequest.headers),
						body: jsonrpcRequest.requestBody,
						cache: "no-cache",
						credentials: "include"
					}
				);

				response = await fetch(request);

				bHTTPErrorMode = !response.ok; 

				if(
					!response.ok
					&& parseInt(response.status, 10) === 0
				)
				{
					jsonrpcRequest.responseObject = {
						"jsonrpc": Client.JSONRPC_VERSION,
						"error": {
							"code": JSONRPC.Exception.NETWORK_ERROR,
							"message": "Network error. The internet connection may have failed."
						},
						"id": jsonrpcRequest.callID
					}; 
					jsonrpcRequest.responseBody = JSON.stringify(jsonrpcRequest.responseObject, undefined, "\t");
				}
				else
				{
					jsonrpcRequest.responseBody = await response.text();
				}
			}

			
			this.emit("beforeJSONDecode", jsonrpcRequest);
			for(let plugin of this._arrPlugins)
			{
				await plugin.beforeJSONDecode(jsonrpcRequest);
			}


			if(jsonrpcRequest.responseObject === null)
			{
				jsonrpcRequest.responseObject = JSONRPC.Utils.jsonDecodeSafe(jsonrpcRequest.responseBody);
			}


			this.emit("afterJSONDecode", jsonrpcRequest);
			for(let plugin of this._arrPlugins)
			{
				await plugin.afterJSONDecode(jsonrpcRequest);
			}


			if(jsonrpcRequest.responseObject.hasOwnProperty("error"))
			{
				if(
					!jsonrpcRequest.responseObject.error.hasOwnProperty("message")
					|| typeof jsonrpcRequest.responseObject.error.message !== "string"
					|| !jsonrpcRequest.responseObject.error.hasOwnProperty("code")
					|| typeof jsonrpcRequest.responseObject.error.code !== "number"
				)
				{
					jsonrpcRequest.callResult = new JSONRPC.Exception("Invalid error object on JSONRPC protocol response. Response: " + JSON.stringify(jsonrpcRequest.responseObject), JSONRPC.Exception.INTERNAL_ERROR);
				}
				else
				{
					jsonrpcRequest.callResult = new JSONRPC.Exception(jsonrpcRequest.responseObject.error.message, jsonrpcRequest.responseObject.error.code);
				}
			}
			else if(jsonrpcRequest.responseObject.hasOwnProperty("result"))
			{
				jsonrpcRequest.callResult = jsonrpcRequest.responseObject.result; 
			}
			else
			{
				bHTTPErrorMode = true;
			}


			if(
				bHTTPErrorMode
				&& !(jsonrpcRequest.callResult instanceof Error)
			)
			{
				jsonrpcRequest.callResult = new JSONRPC.Exception(
					"Invalid error object on JSONRPC protocol response. Response object: " + JSON.stringify(jsonrpcRequest.responseObject) + ". HTTP response class instance: " + JSON.stringify(response) + ".", 
					JSONRPC.Exception.INTERNAL_ERROR
				);
			}
		}
		catch(error)
		{
			jsonrpcRequest.callResult = error;
		}


		if(jsonrpcRequest.callResult instanceof Error)
		{
			this.emit("exceptionCatch", jsonrpcRequest);
			for(let plugin of this._arrPlugins)
			{
				await plugin.exceptionCatch(jsonrpcRequest);
			}
			assert(jsonrpcRequest.callResult instanceof Error, " A plugin has reset the jsonrpcRequest.callResult to a non-error.");

			throw jsonrpcRequest.callResult;
		}


		return jsonrpcRequest.callResult;
	}


	/**
	 * Adds a plugin.
	 * 
	 * @param {JSONRPC.ClientPluginBase} plugin
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
	 * 
	 * @param {JSONRPC.ClientPluginBase} plugin
	 */
	removePlugin(plugin)
	{
		if(!this._arrPlugins.includes(plugin))
		{
			return;
		}

		this._arrPlugins.splice(
			this._arrPlugins.findIndex(
				(itemPlugin) => 
				{
					return plugin === itemPlugin;
				}
			), 
			1
		);
	}


	/**
	 * JSON-RPC server endpoint URL.
	 *
	 * @returns {string|null}
	 */
	get endpointURL()
	{
		return this._strJSONRPCEndpointURL;
	}


	/**
	 * Plugins which extend JSONRPC.ClientPluginBase.
	 *
	 * @returns {Array}
	 */
	get plugins()
	{
		return this._arrPlugins;
	}


	/**
	 * JSON-RPC protocol call ID.
	 *
	 * @returns {number}
	 */
	get callID()
	{
		return this._nCallID;
	}


	/**
	 * The user name part of HTTP credentials used for authentication plugins.
	 *
	 * @returns {string|null} _strHTTPUser
	 */
	get httpUser()
	{
		return this._strHTTPUser;
	}


	/**
	 * The user password part of HTTP credentials used for authentication plugins.
	 * 
	 * @returns {string|null}
	 */
	get httpPassword()
	{
		return this._strHTTPPassword;
	}


	/**
	 * @returns {string}
	 */
	static get JSONRPC_VERSION()
	{
		return "2.0";
	}


	/**
	 * @returns {string[]}
	 */
	rpcFunctions()
	{
		return this.rpc("rpc.functions", [].slice.call(arguments));
	}


	/**
	 * @param {string} strFunctionName
	 * 
	 * @returns {Object}
	 */
	rpcReflectionFunction(strFunctionName)
	{
		return this.rpc("rpc.reflectionFunction", [strFunctionName]);
	}


	/**
	 * @param {Array} arrFunctionNames
	 * 
	 * @returns {Object}
	 */
	rpcReflectionFunctions(arrFunctionNames)
	{
		return this.rpc("rpc.reflectionFunctions", [arrFunctionNames]);
	}


	/**
	 * @returns {string[]}
	 */
	rpcAllowedCrossSiteXHRSubdomains()
	{
		return this.rpc("rpc.allowedCrossSiteXHRSubdomains", []);
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
	}
};
