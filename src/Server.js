const JSONRPC = {};
JSONRPC.Exception = require("./Exception");
JSONRPC.IncomingRequest = require("./IncomingRequest");
JSONRPC.Utils = require("./Utils");
JSONRPC.EndpointBase = require("./EndpointBase");

const assert = require("assert");

module.exports =
class Server
{
	constructor()
	{
		this._arrPlugins = [];
		this._objEndpoints = {};

		Object.seal(this);
	}


	/**
	 * It is assumed the httpServer is shared with outside code (other purposes).
	 * This JSONRPC.Server will only handle URLs under strRootPath.
	 * Specify "/" as root path to use the httpServer exclusively for a specific instance of this class.
	 * 
	 * Any request not under strRootPath will be completely ignored by this JSONRPC.Server.
	 * An outside handler is required for the ignored paths (or the default applies).
	 * 
	 * For paths under strRootPath which do not correspond to an endpoint, this JSONRPC.Server will respond with 404 and a JSONRPC valid error body.
	 * 
	 * Endpoint paths must fall under strRootPath or they will be ignored.
	 * 
	 * @param {http.Server} httpServer
	 * @param {string} strRootPath
	 */
	async attachToHTTPServer(httpServer, strRootPath)
	{
		assert(typeof strRootPath === "string", typeof strRootPath);

		strRootPath = JSONRPC.EndpointBase.normalizePath(strRootPath);

		httpServer.on(
			"request",
			async (httpRequest, httpResponse) => {
				const strRequestPath = JSONRPC.EndpointBase.normalizePath(httpRequest.url);

				// Ignore paths which do not fall under strRootPath, or are not strRootPath. 
				if(strRequestPath.substr(0, strRootPath.length) !== strRootPath)
				{
					httpResponse.end();
					return;
				}

				try
				{
					// Default.
					httpResponse.statusCode = 500;

					const jsonrpcRequest = await this.processHTTPRequest(httpRequest, httpResponse);
					const objResponse = await this.processRequest(jsonrpcRequest);

					if(jsonrpcRequest.callResult instanceof Error)
					{
						httpResponse.statusCode = 500; // Internal Server Error
					}
					else if(jsonrpcRequest.isNotification)
					{
						httpResponse.statusCode = 204; // No Content
					}
					else
					{
						httpResponse.statusCode = 200; // Ok
					}
					

					if(jsonrpcRequest.isNotification)
					{
						/*httpResponse.write(JSON.stringify({
							id: null,
							jsonrpc: "2.0",
							error: {
								message: "JSONRPC 2.0 notfications are not supported.",
								code: JSONRPC.Exception.INTERNAL_ERROR
							}
						}, undefined, "\t"));*/
					}
					else
					{
						httpResponse.setHeader("Content-Type", "application/json");
						httpResponse.write(JSON.stringify(objResponse, undefined, "\t"));
					}
				}
				catch(error)
				{
					console.error(error);
				}

				httpResponse.end();
			}
		);
	}


	/**
	 * @param {EndpointBase} endpoint
	 */
	registerEndpoint(endpoint)
	{
		if(this._objEndpoints.hasOwnProperty(endpoint.path))
		{
			if(this._objEndpoints[endpoint.path] !== endpoint)
			{
				throw new Error("Another JSONRPC endpoint is registered at the same path: " + endpoint.path);
			}
			else
			{
				// Already added. Ignoring.
			}
		}
		else
		{
			this._objEndpoints[endpoint.path] = endpoint;
		}
	}


	/**
	 * Returns true if the endpoint was found and removed.
	 * Returns false if it was not found.
	 * 
	 * @param {string} strPath
	 * 
	 * @returns {boolean}
	 */
	unregisterEndpoint(strPath)
	{
		if(this._objEndpoints.hasOwnProperty(strPath))
		{
			delete this._objEndpoints[strPath];
			return true;
		}
	}


	/**
	 * Adds a plugin.
	 * 
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
	 * 
	 * @param {Object} plugin
	 */
	removePlugin(plugin)
	{
		if(!this._arrPlugins.includes(plugin))
		{
			return;
		}

		this._arrPlugins.splice(
			this._arrPlugins.findIndex(
				(element) =>
				{
					return plugin === element;
				}
			), 
			1
		);
	}


	/**
	 * Code outside of this function is responsible for calling .end() on httpResponse.
	 * 
	 * @param {http.IncomingMessage} httpRequest
	 * @param {http.ServerResponse} httpResponse
	 * 
	 * @returns {JSONRPC.IncomingRequest}
	 */
	async processHTTPRequest(httpRequest, httpResponse)
	{
		const jsonrpcRequest = new JSONRPC.IncomingRequest();

		try
		{
			if(httpRequest.method === "POST")
			{
				let fnReject;
				let fnResolve;
				const promiseWaitForData = new Promise(
					(_fnResolve, _fnReject) => {
						fnReject = _fnReject;
						fnResolve = _fnResolve;
					}
				);

				let arrBody = [];

				httpRequest.on(
					"data", 
					(chunk) => {
						arrBody.push(chunk);
					}
				);

				httpRequest.on("error",	fnReject);
				httpResponse.on("error", fnReject);

				httpRequest.on(
					"end",
					() => {
						fnResolve(Buffer.concat(arrBody).toString());
					}
				);

				jsonrpcRequest.requestBody = await promiseWaitForData;
			}
			else
			{
				throw new Error("JSONRPC does not handle HTTP " + httpRequest.method + " requests.");
			}

			const strPath = JSONRPC.EndpointBase.normalizePath(httpRequest.url);

			if(!this._objEndpoints.hasOwnProperty(strPath))
			{
				throw new JSONRPC.Exception("Unknown JSONRPC endpoint " + strPath + ".", JSONRPC.Exception.METHOD_NOT_FOUND);
			}
			jsonrpcRequest.endpoint = this._objEndpoints[strPath];
		}
		catch(error)
		{
			jsonrpcRequest.callResult = error;
		}

		return jsonrpcRequest;
	}


	/**
	 * Returns the response object or null if in notification mode.
	 * 
	 * @param {JSONRPC.IncomingRequest} jsonrpcRequest
	 * 
	 * @returns {Object|null}
	 */
	async processRequest(jsonrpcRequest)
	{
		try
		{
			if(!jsonrpcRequest.isMethodCalled)
			{
					
				for(let plugin of this._arrPlugins)
				{
					await plugin.beforeJSONDecode(jsonrpcRequest);
				}


				if(!jsonrpcRequest.requestObject)
				{
					jsonrpcRequest.requestObject = JSONRPC.Utils.jsonDecodeSafe(jsonrpcRequest.requestBody);
				}


				for(let plugin of this._arrPlugins)
				{
					await plugin.afterJSONDecode(jsonrpcRequest);
				}


				if(Array.isArray(jsonrpcRequest.requestObject))
				{
					throw new JSONRPC.Exception("Batch requests are not supported by this JSON-RPC server.", JSONRPC.Exception.INTERNAL_ERROR);
				}


				// JSON-RPC 2.0 Specification:
				// A Structured value that holds the parameter values to be used during the invocation of the method.
				// This member MAY be omitted.
				if(!jsonrpcRequest.requestObject.hasOwnProperty("params"))
				{
					jsonrpcRequest.requestObject.params = [];
				}
				else if(!Array.isArray(jsonrpcRequest.requestObject.params))
				{
					if(typeof jsonrpcRequest.requestObject.params === "object")
					{
						throw new JSONRPC.Exception("Named params are not supported by this server.", JSONRPC.Exception.INTERNAL_ERROR);
					}
					else
					{
						throw new JSONRPC.Exception("The params property has invalid data type, per JSON-RPC 2.0 specification. Unexpected type: " + (typeof jsonrpcRequest.requestObject.params) + ".", JSONRPC.Exception.INVALID_REQUEST);
					}
				}


				for(let plugin of this._arrPlugins)
				{
					await plugin.afterJSONDecode(jsonrpcRequest);
				}


				if(!jsonrpcRequest.isAuthenticated)
				{
					throw new JSONRPC.Exception("Not authenticated.", JSONRPC.Exception.NOT_AUTHENTICATED);
				}

				if(!jsonrpcRequest.isAuthorized)
				{
					throw new JSONRPC.Exception("Not authorized.", JSONRPC.Exception.NOT_AUTHORIZED);
				}


				for(let plugin of this._arrPlugins)
				{
					if(jsonrpcRequest.isMethodCalled)
					{
						break;
					}

					// Allows plugins to override normal method calling on the exported endpoint.
					// If a plugin does choose to do this, all subsequent plugins will be skipped. 
					await plugin.callFunction(jsonrpcRequest);
				}

				
				if(!jsonrpcRequest.isMethodCalled)
				{
					if(typeof jsonrpcRequest.endpoint[jsonrpcRequest.requestObject.method] !== "function")
					{
						throw new JSONRPC.Exception("Method " + JSON.stringify(jsonrpcRequest.requestObject.method) + " not found on endpoint " + JSON.stringify(jsonrpcRequest.endpoint.path) + ".", JSONRPC.Exception.METHOD_NOT_FOUND);
					}

					jsonrpcRequest.callResult = await jsonrpcRequest.endpoint[jsonrpcRequest.requestObject.method].apply(jsonrpcRequest.endpoint, jsonrpcRequest.requestObject.params);
				}
			}
		}
		catch(error)
		{
			jsonrpcRequest.callResult = error;
		}


		for(let plugin of this._arrPlugins)
		{
			if(jsonrpcRequest.callResult instanceof Error)
			{
				await plugin.exceptionCatch(jsonrpcRequest);
			}
			else
			{
				await plugin.result(jsonrpcRequest);
			}
		}


		let objResponse = jsonrpcRequest.toResponseObject();

		for(let plugin of this._arrPlugins)
		{
			await plugin.response(objResponse);
		}

		return objResponse;
	}
};
