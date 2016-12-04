const JSONRPC={};
JSONRPC.Exception=require("./Exception");
JSONRPC.IncomingRequest=require("./IncomingRequest");
JSONRPC.Utils=require("./Utils");
JSONRPC.EndpointBase=require("./EndpointBase");


module.exports=
class Server
{
	constructor()
	{
		this._arrPlugins=[];
		this._objEndpoints={};

		Object.seal(this);
	}


	/**
	 * @param {http.Server} httpServer
	 */
	async attachToHTTPServer(httpServer)
	{
		httpServer.on(
			"request",
			async (httpRequest, httpResponse) => 
			{
				if(httpRequest.url === "/favicon.ico")
				{
					httpResponse.statusCode=404;
					httpResponse.end();
					return;
				}

				try
				{
					// Default.
					httpResponse.statusCode = 500;

					const jsonrpcRequest=await this.processHTTPRequest(httpRequest, httpResponse);
					const objResponse=await this.processRequest(jsonrpcRequest);

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

					if(!jsonrpcRequest.isNotification)
					{
						httpResponse.write(JSON.stringify(objResponse, undefined, "\t"));
					}
				}
				catch(error)
				{
					console.log(error);
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
				throw new Error("Another JSONRPC endpoint is registered at the same path: "+endpoint.path);
			}
			else
			{
				// Already added. Ignoring.
			}
		}
		else
		{
			this._objEndpoints[endpoint.path]=endpoint;
		}
	}


	/**
	 * Returns true if the endpoint was found and removed.
	 * Returns false if it was not found.
	 * 
	 * @param {string} strPath
	 * 
	 * @return {boolean}
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

		this._arrPlugins.splice(
			this._arrPlugins.findIndex(
				(element)=>
				{
					return plugin===element;
				}
			), 
			1
		);
	}


	/**
	 * Code outside of this function is responsible for calling .end() on httpResponse.
	 * 
	 * @return {JSONRPC.IncomingRequest}
	 */
	async processHTTPRequest(httpRequest, httpResponse)
	{
		const jsonrpcRequest=new JSONRPC.IncomingRequest();

		try
		{
			jsonrpcRequest.httpRequest=httpRequest;
			
			if(httpRequest.method === "POST")
			{
				let fnReject;
				let fnResolve;
				const promiseWaitForData=new Promise(
					(_fnResolve, _fnReject) =>
					{
						fnReject=_fnReject;
						fnResolve=_fnResolve;
					}
				);

				let arrBody = [];

				httpRequest.on(
					"data", 
					(chunk)=>
					{
						arrBody.push(chunk);
					}
				);

				httpRequest.on("error",	fnReject);
				httpResponse.on("error", fnReject);

				httpRequest.on(
					"end",
					() => 
					{
						fnResolve(Buffer.concat(arrBody).toString());
					}
				);

				jsonrpcRequest.body = await promiseWaitForData;
			}
			else
			{
				jsonrpcRequest.callResult=null;
				jsonrpcRequest.body="";
			}


			const strPath=JSONRPC.EndpointBase.normalizePath(httpRequest.url);

			if(!this._objEndpoints.hasOwnProperty(strPath))
			{
				throw new JSONRPC.Exception("Unknown JSONRPC endpoint "+strPath+".", JSONRPC.Exception.METHOD_NOT_FOUND);
			}
			jsonrpcRequest.endpoint = this._objEndpoints[strPath];
		}
		catch(error)
		{
			console.log(error);
			jsonrpcRequest.callResult=error;
		}

		return jsonrpcRequest;
	}


	/**
	 * Returns the response object or null if in notification mode.
	 * 
	 * @param {JSONRPC.IncomingRequest} jsonrpcRequest
	 * 
	 * @return {Object|null}
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
					jsonrpcRequest.requestObject=JSONRPC.Utils.jsonDecodeSafe(jsonrpcRequest.body);
				}


				// Bi-directional support.
				// Ignoring response objects.
				if(jsonrpcRequest.requestObject.hasOwnProperty("error") || jsonrpcRequest.requestObject.hasOwnProperty("result"))
				{
					return;
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
					jsonrpcRequest.requestObject.params=[];
				}
				else if(!Array.isArray(jsonrpcRequest.requestObject.params))
				{
					if(typeof jsonrpcRequest.requestObject.params === "object")
					{
						throw new JSONRPC.Exception("Named params are not supported by this server.", JSONRPC.Exception.INTERNAL_ERROR);
					}
					else
					{
						throw new JSONRPC.Exception("The params property has invalid data type, per JSON-RPC 2.0 specification. Unexpected type: "+(typeof jsonrpcRequest.requestObject.params)+".", JSONRPC.Exception.INVALID_REQUEST);
					}
				}


				for(let plugin of this._arrPlugins)
				{
					await plugin.afterJSONDecode(jsonrpcRequest);
				}


				if(!jsonrpcRequest.isAuthenticated)
				{
					console.log(this._arrPlugins);
					throw new JSONRPC.Exception("Not authenticated.", JSONRPC.Exception.NOT_AUTHENTICATED);
				}

				if(!jsonrpcRequest.isAuthorized)
				{
					console.log(this._arrPlugins);
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
						throw new JSONRPC.Exception("Method "+JSON.stringify(jsonrpcRequest.requestObject.method)+" not found on endpoint "+JSON.stringify(jsonrpcRequest.endpoint.path)+".", JSONRPC.Exception.METHOD_NOT_FOUND);
					}

					jsonrpcRequest.callResult=await jsonrpcRequest.endpoint[jsonrpcRequest.requestObject.method].apply(jsonrpcRequest.endpoint, jsonrpcRequest.requestObject.params);
				}
			}
		}
		catch(error)
		{
			jsonrpcRequest.callResult=error;
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


		let objResponse=jsonrpcRequest.toResponseObject();

		for(let plugin of this._arrPlugins)
		{
			await plugin.response(objResponse);
		}

		return objResponse;
	}


	/**
	 * @returns {String}
	 */
	static get JSONRPC_VERSION()
	{
		return "2.0";
	}
};
