const url = require("url");

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
		this._strBase64BasicAuthentication = null;

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
		this._strBase64BasicAuthentication = new Buffer(strUsername + ":" + strPassword).toString("base64");
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

		const outgoingRequest = new JSONRPC.OutgoingRequest(strFunctionName, arrParams, this._nCallID);
		this._nCallID++;

		try
		{
			outgoingRequest.endpointURL = this.endpointURL;
			outgoingRequest.headers["Content-Type"] = "application/json";

			if(this.httpUser !== null && this.httpPassword !== null)
			{
				outgoingRequest.headers["Authorization"] = "Basic " + this._strBase64BasicAuthentication;
			}


			outgoingRequest.requestObject = outgoingRequest.toRequestObject();

			this.emit("beforeJSONEncode", outgoingRequest);
			for(let plugin of this._arrPlugins)
			{
				await plugin.beforeJSONEncode(outgoingRequest);
			}


			outgoingRequest.requestBody = JSON.stringify(outgoingRequest.requestObject, null, "\t");
			// console.log(outgoingRequest.requestObject);
			// console.log(outgoingRequest.requestBody);

			this.emit("afterJSONEncode", outgoingRequest);
			for(let plugin of this._arrPlugins)
			{
				await plugin.afterJSONEncode(outgoingRequest);
			}


			if(!outgoingRequest.isMethodCalled)
			{
				this.emit("makeRequest", outgoingRequest);
			}
			for(let plugin of this._arrPlugins)
			{
				if(outgoingRequest.isMethodCalled)
				{
					break;
				}

				await plugin.makeRequest(outgoingRequest);
			}


			let response = null;
			let bHTTPErrorMode = false;
			if(!outgoingRequest.isMethodCalled)
			{
				const request = new Request(
					outgoingRequest.endpointURL,
					{
						method: "POST",
						mode: "cors",
						headers: new Headers(outgoingRequest.headers),
						body: outgoingRequest.requestBody,
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
					outgoingRequest.responseObject = {
						"jsonrpc": Client.JSONRPC_VERSION,
						"error": {
							"code": JSONRPC.Exception.NETWORK_ERROR,
							"message": "Network error. The internet connection may have failed."
						},
						"id": outgoingRequest.callID
					}; 
					outgoingRequest.responseBody = JSON.stringify(outgoingRequest.responseObject, undefined, "\t");
				}
				else
				{
					outgoingRequest.responseBody = await response.text();
				}
			}


			this.emit("beforeJSONDecode", outgoingRequest);
			for(let plugin of this._arrPlugins)
			{
				await plugin.beforeJSONDecode(outgoingRequest);
			}


			if(outgoingRequest.responseObject === null)
			{
				outgoingRequest.responseObject = JSONRPC.Utils.jsonDecodeSafe(outgoingRequest.responseBody);
			}
			

			this.emit("afterJSONDecode", outgoingRequest);
			for(let plugin of this._arrPlugins)
			{
				await plugin.afterJSONDecode(outgoingRequest);
			}


			if(outgoingRequest.responseObject.hasOwnProperty("error"))
			{
				if(
					!outgoingRequest.responseObject.error.hasOwnProperty("message")
					|| typeof outgoingRequest.responseObject.error.message !== "string"
					|| !outgoingRequest.responseObject.error.hasOwnProperty("code")
					|| typeof outgoingRequest.responseObject.error.code !== "number"
				)
				{
					outgoingRequest.callResult = new JSONRPC.Exception("Invalid error object on JSONRPC protocol response. Response: " + JSON.stringify(outgoingRequest.responseObject), JSONRPC.Exception.INTERNAL_ERROR);
				}
				else
				{
					outgoingRequest.callResult = new JSONRPC.Exception(outgoingRequest.responseObject.error.message, outgoingRequest.responseObject.error.code);
				}
			}
			else if(outgoingRequest.responseObject.hasOwnProperty("result"))
			{
				outgoingRequest.callResult = outgoingRequest.responseObject.result; 
			}
			else
			{
				bHTTPErrorMode = true;
			}


			if(
				bHTTPErrorMode
				&& !(outgoingRequest.callResult instanceof Error)
			)
			{
				outgoingRequest.callResult = new JSONRPC.Exception(
					"Invalid error object on JSONRPC protocol response. Response object: " + JSON.stringify(outgoingRequest.responseObject) + ". HTTP response class instance: " + JSON.stringify(response) + ".", 
					JSONRPC.Exception.INTERNAL_ERROR
				);
			}
		}
		catch(error)
		{
			outgoingRequest.callResult = error;
		}


		if(outgoingRequest.callResult instanceof Error)
		{
			this.emit("exceptionCatch", outgoingRequest);
			for(let plugin of this._arrPlugins)
			{
				await plugin.exceptionCatch(outgoingRequest);
			}
			//assert(outgoingRequest.callResult instanceof Error, " A plugin has reset the outgoingRequest.callResult to a non-error.");

			throw outgoingRequest.callResult;
		}


		return outgoingRequest.callResult;
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
