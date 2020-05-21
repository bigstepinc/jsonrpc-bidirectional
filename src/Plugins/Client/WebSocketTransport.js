const JSONRPC = {};
JSONRPC.ClientPluginBase = require("../../ClientPluginBase");
JSONRPC.Utils = require("../../Utils");
JSONRPC.Exception = require("../../Exception");

JSONRPC.WebSocketAdapters = {};
JSONRPC.WebSocketAdapters.WebSocketWrapperBase = require("../../WebSocketAdapters/WebSocketWrapperBase");

const assert = require("assert");

const sleep = require("sleep-promise");
const WebSocket = require("ws");

const fnNoop = () => {};


module.exports =
class WebSocketTransport extends JSONRPC.ClientPluginBase
{
	/**
	 * ***** bAutoReconnect = false *****
	 * If bAutoReconnect is false then waitReady() has no effect and the provided webSocket is expected to be connected when passed to the constructor.
	 * The webSocket param cannot be null.
	 * If the webSocket becomes disconnected it will not be reconnected.
	 * strWebSocketURL can be null as it will be copied from webSocket.url.
	 * waitReady() is not used.
	 * fnWaitReadyOnConnected is ignored if provided.
	 * Example: 
	 * const webSocket = new WebSocket("wss://yourdomain.com/api/ws");
	 * const bBidirectionalMode = false;
	 * new WebSocketTransport(webSocket, bBidirectionalMode);
	 * 
	 * ***** bAutoReconnect = true *****
	 * If bAutoReconnect is true then waitReady() is used in .rpc() and .makeRequest().
	 * If the webSocket becomes disconnected it will be reconnected.
	 * The webSocket needs to passed as null when bAutoReconnect is true as it will be created automatically.
	 * strWebSocketURL must be non-null.
	 * fnWaitReadyOnConnected is expected to return a Promise (async function).
	 *
	 * Auto-reconnecting client example: 
	 *
	 * const client = new JSONRPC.Client("https://yourdomain.com/api");
	 * 
	 * const bBidirectionalMode = false;
	 * const webSocketTransport = new JSONRPC.Plugins.Client.WebSocketTransport(
	 *     null, 
	 *     bBidirectionalMode, 
	 *     {
	 *         bAutoReconnect: true,
	 *         strWebSocketURL: "wss://yourdomain.com/api",
	 *         fnWaitReadyOnConnected: async() => {
         *             await client.rpcX({method: "login", params: ["admin", "password"], skipWaitReadyOnConnect: true});
	 *         }
	 *     }
	 * );
	 * client.addPlugin(webSocketTransport);
	 * 
	 *
	 * strWebSocketURL is extracted automatically from webSocket if a webSocket is provided, otherwise it is mandatory to be set.
	 * 
	 * fnWaitReadyOnConnected gives a chance to make extra API calls, like authentication calls, right after the websocket becomes connected.
	 * .waitReady() will not resolve until fnWaitReadyOnConnected also resolves.
	 * 
	 * fnWaitReadyOnConnected is called by .waitReady() after the webSocket becomes connected when this._bAutoReconnect is true.
	 * . at all if this._bAutoReconnect is false.
	 * 
	 * Inside fnWaitReadyOnConnected, all API calls made through the JSONRPC.Client instance which has this transport added 
	 * MUST set the .rpc() bSkipWaitReadyOnConnect param (or .rpcX({skipWaitReadyOnConnect})) to true or else the call will hang forever.
	 * 
	 * 
	 * A WebSocket ping control frame (most efficient way to ping for a WebSocket) is sent at an interval (the smallest of nKeepAliveTimeoutMilliseconds / 2 or 4000 milliseconds) by the server side (if configured to do so using a non-null nKeepAliveTimeoutMilliseconds). 
	 * The client checks (if configured to do so using a non-null nKeepAliveTimeoutMilliseconds) if a ping was received since connecting or since the last ping (whichever came last).
	 * If the ping (or pong for compatibility with other keep alive systems in other libraries) control frame is not seen by the client for nKeepAliveTimeoutMilliseconds then the client will close its WebSocket.
	 * If the pong (or ping for compatibility with other keep alive systems in other libraries) control frame is not seen by the server for nKeepAliveTimeoutMilliseconds then the server will close its WebSocket.
	 * 
	 * nKeepAliveTimeoutMilliseconds can to be configured on both the server and the client. When configuring nKeepAliveTimeoutMilliseconds on a client which doesn't support the WebSocket.ping() API (like some browsers), 
	 * then nKeepAliveTimeoutMilliseconds MUST be configured on the server as well.
	 * 
	 * @param {WebSocket|null} webSocket = null
	 * @param {boolean|undefined} bBidirectionalWebSocketMode = false
	 * @param {{strWebSocketURL: string|null, bAutoReconnect: boolean, fnWaitReadyOnConnected: Function|null, jsonrpcBidirectionalRouter: JSONRPC.RouterBase|null, jsonrpcClient: JSONRPC.Client|null, nKeepAliveTimeoutMilliseconds: number|null}} objDestructuringParam
	 */
	constructor(
		webSocket = null, 
		bBidirectionalWebSocketMode = false, 
		{
			nKeepAliveTimeoutMilliseconds = null, 

			bAutoReconnect = false, 

			// Auto reconnect params.
			strWebSocketURL = null, 
			fnWaitReadyOnConnected = null, 
			nWaitReadyTimeoutSeconds = 20, 

			// Auto reconnect params when bBidirectionalWebSocketMode = true.
			jsonrpcBidirectionalRouter = null, 
			jsonrpcClient = null
		} = {}
	)
	{
		assert(fnWaitReadyOnConnected === null || typeof fnWaitReadyOnConnected === "function");
		assert(typeof bAutoReconnect === "boolean");
		assert(strWebSocketURL === null || typeof strWebSocketURL === "string");
		assert(typeof bBidirectionalWebSocketMode === "boolean");
		// assert((typeof webSocket === "object" && webSocket.url) || webSocket === null);

		super();
		

		// JSONRPC call ID as key, {promise: {Promise}, fnResolve: {Function}, fnReject: {Function}, outgoingRequest: {OutgoingRequest}} as values.
		this._mapCallIDToWebSocketRequestsPromises = new Map();


		this._bBidirectionalWebSocketMode = !!bBidirectionalWebSocketMode;
		this._webSocket = webSocket;
		this._bAutoReconnect = bAutoReconnect;
		this._fnWaitReadyOnConnected = fnWaitReadyOnConnected;
		this._nWaitReadyTimeoutSeconds = nWaitReadyTimeoutSeconds;
		this._jsonrpcBidirectionalRouter = jsonrpcBidirectionalRouter;
		this._jsonrpcClient = jsonrpcClient;
		
		this._nKeepAliveTimeoutMilliseconds = nKeepAliveTimeoutMilliseconds;
		this._nIntervalIDSendKeepAlivePing = null;
		this._nTimeoutIDCheckKeepAliveReceived = null;


		if(bAutoReconnect && !this._jsonrpcBidirectionalRouter && bBidirectionalWebSocketMode)
		{
			throw new Error("jsonrpcBidirectionalRouter is mandatory when bAutoReconnect = true and bBidirectionalWebSocketMode = true.");
		}

		if(bAutoReconnect && !this._jsonrpcClient && bBidirectionalWebSocketMode)
		{
			throw new Error("jsonrpcClient param is mandatory when bAutoReconnect = true and bBidirectionalWebSocketMode = true.");
		}

		if(!strWebSocketURL)
		{
			if(webSocket)
			{
				strWebSocketURL = webSocket.url;
			}
			else
			{
				throw new Error("strWebSocketURL must be provided when passing a null webSocket");
			}
		}

		this._strWebSocketURL = strWebSocketURL;


		if(webSocket)
		{
			this._setupWebSocket();
			this._setupKeepAlive(webSocket);
		}
		
		if(!webSocket && !strWebSocketURL)
		{
			throw new Error("At least one of webSocket or strWebSocketURL need to be provided.");
		}

		if(bAutoReconnect && webSocket)
		{
			throw new Error("webSocket needs to be passed as null when bAutoReconnect is true.");
		}
	}


	/**
	 * Returns a ws compatible WebSocket class reference.
	 * If not overriden it returns ws.
	 * 
	 * Allows for swapping out ws with something else.
	 * 
	 * @returns {Class}
	 */
	webSocketClass()
	{
		return WebSocket;
	}


	async _initWebSocket()
	{
		if(!this._bAutoReconnect)
		{
			return;
		}

		if(this._waitReadyPromise)
		{
			return this._waitReadyPromise;
		}
	}


	_setupKeepAlive(webSocket)
	{
		if(this._nKeepAliveTimeoutMilliseconds !== null)
		{
			if(webSocket.readyState === WebSocket.OPEN)
			{
				if(webSocket.ping)
				{
					this._nIntervalIDSendKeepAlivePing = setInterval(() => {
						webSocket.ping(fnNoop);
					}, Math.max(1, Math.min(4000, Math.floor(this._nKeepAliveTimeoutMilliseconds / 2))));
				}

				const fnOnKeepAlive = (() => {
					if(this._nTimeoutIDCheckKeepAliveReceived !== null)
					{
						clearTimeout(this._nTimeoutIDCheckKeepAliveReceived);
					}

					this._nTimeoutIDCheckKeepAliveReceived = setTimeout(() => {
						if([WebSocket.CLOSING, WebSocket.OPEN].includes(webSocket.readyState))
						{
							console.error(`Closing WebSocket because timed out after ${this._nKeepAliveTimeoutMilliseconds} milliseconds waiting for ping/pong keep alive control frame.`);

							webSocket.close(
								/*CLOSE_NORMAL*/ 1000, // Chrome only supports 1000 or the 3000-3999 range ///* CloseEvent.Internal Error */ 1011, 
								`Closing WebSocket because timed out after ${this._nKeepAliveTimeoutMilliseconds} milliseconds waiting for ping/pong keep alive control frame.`
							);
						}
					}, this._nKeepAliveTimeoutMilliseconds);
				}).bind(this);
				
				
				fnOnKeepAlive();


				const fnOnClose = (nCode, strReason, bWasClean) => {
					if(this._nIntervalIDSendKeepAlivePing !== null)
					{
						clearInterval(this._nIntervalIDSendKeepAlivePing);
						this._nIntervalIDSendKeepAlivePing = null;
					}

					if(this._nTimeoutIDCheckKeepAliveReceived !== null)
					{
						clearTimeout(this._nTimeoutIDCheckKeepAliveReceived);
						this._nTimeoutIDCheckKeepAliveReceived = null;
					}

					if(webSocket.on && webSocket.removeListener && process && process.release)
					{
						webSocket.removeListener("pong", fnOnKeepAlive);
						webSocket.removeListener("ping", fnOnKeepAlive);
						webSocket.removeListener("close", fnOnClose);
					}
					else if(webSocket.addEventListener && webSocket.removeEventListener)
					{
						webSocket.removeEventListener("pong", fnOnKeepAlive);
						webSocket.removeEventListener("ping", fnOnKeepAlive);
						webSocket.removeEventListener("close", fnOnClose);
					}
					else
					{
						throw new Error("Failed to detect runtime or websocket interface type (browser, nodejs, websockets/ws npm package compatible interface, etc.");
					}
				};


				if(webSocket.on && webSocket.removeListener && process && process.release)
				{
					webSocket.on("pong", fnOnKeepAlive);
					webSocket.on("ping", fnOnKeepAlive);
					webSocket.on("close", fnOnClose);
				}
				else if(webSocket.addEventListener && webSocket.removeEventListener)
				{
					webSocket.addEventListener("pong", fnOnKeepAlive);
					webSocket.addEventListener("ping", fnOnKeepAlive);
					webSocket.addEventListener("close", fnOnClose);
				}
				else
				{
					throw new Error("Failed to detect runtime or websocket interface type (browser, nodejs, websockets/ws npm package compatible interface, etc.");
				}
			}
			else
			{
				throw new Error(`Was expecting WebSocket passed to ._setupKeepAlive() to to be in WebSocket.OPEN readyState. Found readyState ${webSocket.readyState}`);
			}
		}
	}


	/**
	 * @override
	 */
	async waitReady({bSkipWaitReadyOnConnect = false})
	{
		if(!this._bAutoReconnect)
		{
			return;
		}

		if(this._waitReadyPromise && !bSkipWaitReadyOnConnect)
		{
			return this._waitReadyPromise;
		}

		const promise = new Promise(async(fnResolve, fnReject) => {
			let nTimeoutID;
			let webSocket = this._webSocket;

			try
			{
				if(
					this._webSocket
					&& [WebSocket.CLOSED, WebSocket.CLOSING].includes(this._webSocket.readyState)
				)
				{
					try
					{
						this._webSocket.close();
					}
					catch(error)
					{
						console.error(error);
					}
					finally
					{
						this._webSocket = null;
					}

					// Preventing flooding backend with reconnects.
					await sleep(2000);
				}
		
		
				if(!this._webSocket)
				{
					const WebSocketClass = this.webSocketClass();
					this._webSocket = new WebSocketClass(this._strWebSocketURL);
					webSocket = this._webSocket;
					this._setupWebSocket();

					nTimeoutID = setTimeout(
						() => {
							const error = new JSONRPC.Exception(
								`Timeout connecting to server. waitReady() in JSONRPC WebSocketTransport timed out after ${this._nWaitReadyTimeoutSeconds} seconds.`, 
								JSONRPC.Exception.REQUEST_EXPIRED
							);
							fnReject(error);
							webSocket.close(
								/*CLOSE_NORMAL*/ 1000, // Chrome only supports 1000 or the 3000-3999 range ///* CloseEvent.Internal Error */ 1011, 
								error.message
							);
						},
						this._nWaitReadyTimeoutSeconds * 1000
					);

					await new Promise((__fnResolve, __fnReject) => {
						// Promise callback may execute on the next VM pass or even much later together with CPU exhaustion.
						// Testing state because of small chance of race condition until adding listeners

						if([WebSocket.CLOSED, WebSocket.CLOSING].includes(webSocket.readyState))
						{
							__fnReject(new Error("WebSocket closed immediately and unexpectedly."));
						}

						// Most likely WebSocket.CONNECTING, there isn't any other lifecyle state at the time of implementing this.
						else if(![WebSocket.OPEN].includes(webSocket.readyState))
						{
							if(webSocket.on && webSocket.removeListener && process && process.release)
							{
								webSocket.on("open", __fnResolve);
								webSocket.on("error", __fnReject);
							}
							else if(webSocket.addEventListener && webSocket.removeEventListener)
							{
								webSocket.addEventListener("open", __fnResolve);
								webSocket.addEventListener("error", __fnReject);
							}
							else
							{
								throw new Error("Failed to detect runtime or websocket interface type (browser, nodejs, websockets/ws npm package compatible interface, etc.");
							}
						}
					});

					if(![WebSocket.OPEN].includes(webSocket.readyState))
					{
						throw new Error("Was expecting WebSocket to be open at this stage.");
					}

					this._setupKeepAlive(webSocket);

					if(this._bBidirectionalWebSocketMode)
					{
						const nWebSocketConnectionID = this._jsonrpcBidirectionalRouter.addWebSocketSync(webSocket);
						
						// Store this client as reverse calls client.
						this._jsonrpcBidirectionalRouter.connectionIDToSingletonClient(nWebSocketConnectionID, /*client class reference*/ null, this._jsonrpcClient);
					}
				}


				if(this._fnWaitReadyOnConnected && !bSkipWaitReadyOnConnect)
				{
					await this._fnWaitReadyOnConnected();
				}

				fnResolve();
			}
			catch(error)
			{
				console.error(error);
				
				await sleep(5000);
				fnReject(error);
				this._waitReadyPromise = null;
			}
			finally
			{
				if(nTimeoutID !== undefined)
				{
					clearTimeout(nTimeoutID);
				}
			}
		});

		if(!bSkipWaitReadyOnConnect)
		{
			this._waitReadyPromise = promise;
		}

		return promise;
	}


	/**
	 * @returns {undefined}
	 */
	dispose()
	{
		try
		{
			this._bAutoReconnect = false;
			this._webSocket.close();
		}
		catch(error)
		{
			console.error(error);
		}

		super.dispose();
	}


	/**
	 * @returns {WebSocket} 
	 */
	get webSocket()
	{
		return this._webSocket;
	}


	/**
	 * @returns {string}
	 */
	get webSocketURL()
	{
		return this._strWebSocketURL;
	}


	/**
	 * strResponse is a string with the response JSON.
	 * objResponse is the object obtained after JSON parsing for strResponse.
	 * 
	 * @param {string} strResponse
	 * @param {object|undefined} objResponse
	 */
	async processResponse(strResponse, objResponse)
	{
		if(!objResponse)
		{
			try
			{
				objResponse = JSONRPC.Utils.jsonDecodeSafe(strResponse);
			}
			catch(error)
			{
				console.error(error);
				console.error("Unable to parse JSON. RAW remote response: " + strResponse);

				if(this._webSocket.readyState === JSONRPC.WebSocketAdapters.WebSocketWrapperBase.OPEN)
				{
					this._webSocket.close(
						/*CLOSE_NORMAL*/ 1000, // Chrome only supports 1000 or the 3000-3999 range ///* CloseEvent.Internal Error */ 1011, 
						"Unable to parse JSON. RAW remote response: " + strResponse
					);
				}

				return;
			}
		}

		if(
			(
				typeof objResponse.id !== "number"
				&& typeof objResponse.id !== "string"
			)
			|| !this._mapCallIDToWebSocketRequestsPromises.has(objResponse.id)
		)
		{
			console.error(objResponse);
			console.error(new Error("Couldn't find JSONRPC response call ID in this._objWebSocketRequestsPromises. RAW response: " + strResponse));
			console.error(new Error("RAW remote message: " + strResponse));
			console.log("Unclean state. Unable to match WebSocket message to an existing Promise or qualify it as a request.");

			if(this._webSocket.readyState === JSONRPC.WebSocketAdapters.WebSocketWrapperBase.OPEN)
			{
				this.webSocket.close(
					/*CLOSE_NORMAL*/ 1000, // Chrome only supports 1000 or the 3000-3999 range ///* CloseEvent.Internal Error */ 1011, 
					"Unclean state. Unable to match WebSocket message to an existing Promise or qualify it as a request."
				);
			}

			return;
		}

		const objWebSocketRequest = this._mapCallIDToWebSocketRequestsPromises.get(objResponse.id);
		if(objWebSocketRequest)
		{
			objWebSocketRequest.outgoingRequest.responseBody = strResponse;
			objWebSocketRequest.outgoingRequest.responseObject = objResponse;
	
			objWebSocketRequest.fnResolve(null);
			// Sorrounding code will parse the result and throw if necessary. fnReject is not going to be used in this function.

			this._mapCallIDToWebSocketRequestsPromises.delete(objResponse.id);
		}
	}


	/**
	 * Populates the the OutgoingRequest class instance (outgoingRequest) with the RAW JSON response and the JSON parsed response object.
	 * 
	 * @param {JSONRPC.OutgoingRequest} outgoingRequest
	 * 
	 * @returns {Promise.<null>}
	 */
	async makeRequest(outgoingRequest)
	{
		if(outgoingRequest.isMethodCalled)
		{
			return;
		}

		await this.waitReady({bSkipWaitReadyOnConnect: outgoingRequest.skipWaitReadyOnConnect});

		if(this.webSocket.readyState !== JSONRPC.WebSocketAdapters.WebSocketWrapperBase.OPEN)
		{
			throw new Error("WebSocket not connected. Current WebSocket readyState: " + JSON.stringify(this.webSocket.readyState));
		}

		outgoingRequest.isMethodCalled = true;


		let objWebSocketRequest;


		if(outgoingRequest.isNotification)
		{
			// JSONRPC 2.0 notification requests don't have the id property at all, not even null. JSONRPC 2.0 servers do not send a response at all for these types of requests.
		}
		else
		{
			/**
			 * http://www.jsonrpc.org/specification#notification
			 * 
			 * id
			 * An identifier established by the Client that MUST contain a String, Number, or NULL value if included. If it is not included it is assumed to be a notification. The value SHOULD normally not be Null [1] and Numbers SHOULD NOT contain fractional parts [2]
			 * The Server MUST reply with the same value in the Response object if included. This member is used to correlate the context between the two objects.
			 * 
			 * [1] The use of Null as a value for the id member in a Request object is discouraged, because this specification uses a value of Null for Responses with an unknown id. Also, because JSON-RPC 1.0 uses an id value of Null for Notifications this could cause confusion in handling.
			 * 
			 * [2] Fractional parts may be problematic, since many decimal fractions cannot be represented exactly as binary fractions.
			 * 
			 * =====================================
			 * 
			 * Asynchronous JSONRPC 2.0 clients must set the "id" property to be able to match responses to requests, as they arrive out of order.
			 * The "id" property cannot be null, but it can be omitted in the case of notification requests, which expect no response at all from the server.
			 */
			assert(
				typeof outgoingRequest.requestObject.id === "number" || typeof outgoingRequest.requestObject.id === "string", 
				"outgoingRequest.requestObject.id must be of type number or string."
			);

			if(this._mapCallIDToWebSocketRequestsPromises.has(outgoingRequest.requestObject.id))
			{
				throw new Error(`JSONRPC client request ID ${JSON.stringify(outgoingRequest.requestObject.id)} already used.`);
			}
			
			objWebSocketRequest = {
				// unixtimeMilliseconds: (new Date()).getTime(),
				outgoingRequest: outgoingRequest,
				promise: null,
				fnReject: undefined,
				fnResolve: undefined
			};

			objWebSocketRequest.promise = new Promise((fnResolve, fnReject) => {
				objWebSocketRequest.fnResolve = fnResolve;
				objWebSocketRequest.fnReject = fnReject;
			});

			// Promise callback might not get called in VM when CPU exhausted.
			while(!objWebSocketRequest.fnReject)
			{
				await sleep(5);
			}

			this._mapCallIDToWebSocketRequestsPromises.set(outgoingRequest.requestObject.id, objWebSocketRequest);
		}


		await this.waitReady({bSkipWaitReadyOnConnect: outgoingRequest.skipWaitReadyOnConnect});
		this.webSocket.send(outgoingRequest.requestBody);


		if(outgoingRequest.isNotification)
		{
			// JSONRPC 2.0 notification requests don't have the id property at all, not even null. JSONRPC 2.0 servers do not send a response at all for these types of requests.
		}
		else
		{
			return objWebSocketRequest.promise;
		}
	}


	/**
	 * @param {Error} error
	 */
	rejectAllPromises(error)
	{
		// console.error(error);

		if(this._mapCallIDToWebSocketRequestsPromises.size)
		{
			console.log(`Rejecting ${this._mapCallIDToWebSocketRequestsPromises.size} Promise instances in WebSocketTransport.`);

			for(let objWebSocketRequest of this._mapCallIDToWebSocketRequestsPromises.values())
			{
				objWebSocketRequest.fnReject(error);
			}
	
			this._mapCallIDToWebSocketRequestsPromises.clear();
		}
	}


	/**
	 * @protected
	 */
	_setupWebSocket()
	{
		// Reference held in local context variable because it can change in an event processing race.
		const webSocket = this._webSocket;

		if(webSocket.on && webSocket.removeListener && process && process.release)
		{
			const fnOnError = (error) => {
				if(webSocket === this._webSocket)
				{
					this._waitReadyPromise = null;
				}

				this.rejectAllPromises(error);
			};
			const fnOnClose = (nCode, strReason, bWasClean) => {
				if(webSocket === this._webSocket)
				{
					this._waitReadyPromise = null;
				}

				this.rejectAllPromises(new Error("WebSocket closed. Code: " + JSON.stringify(nCode) + ". Message: " + JSON.stringify(strReason)));

				if(!this._bBidirectionalWebSocketMode)
				{
					webSocket.removeListener("message", fnOnMessage);
				}
	
				webSocket.removeListener("close", fnOnClose);
				webSocket.removeListener("error", fnOnError);
			};
			const fnOnMessage = async(mxData, objFlags) => {
				try
				{
					await this.processResponse(mxData);
				}
				catch(error)
				{
					console.error(error);

					// If processResponse throws then trigger cleanup and start over to avoid any leaks like unresolved .rpc() promises.
					if(webSocket.readyState === JSONRPC.WebSocketAdapters.WebSocketWrapperBase.OPEN)
					{
						webSocket.close(
							/*CLOSE_NORMAL*/ 1000, // Chrome only supports 1000 or the 3000-3999 range ///* CloseEvent.Internal Error */ 1011
							`${error.message}`
						);
					}
				}
			};
			
			webSocket.on("error", fnOnError);
			webSocket.on("close", fnOnClose);

			this.on("dispose", fnOnClose);

			if(!this._bBidirectionalWebSocketMode)
			{
				webSocket.on("message", fnOnMessage);
			}
		}
		else if(webSocket.addEventListener && webSocket.removeEventListener)
		{
			const fnOnError = (error) => {
				if(webSocket === this._webSocket)
				{
					this._waitReadyPromise = null;
				}

				this.rejectAllPromises(error);
			};

			const fnOnClose = (closeEvent) => {
				if(webSocket === this._webSocket)
				{
					this._waitReadyPromise = null;
				}

				this.rejectAllPromises(new Error("WebSocket closed. Code: " + JSON.stringify(closeEvent.code) + ". Message: " + JSON.stringify(closeEvent.reason) + ". wasClean: " + JSON.stringify(closeEvent.wasClean)));

				if(!this._bBidirectionalWebSocketMode)
				{
					webSocket.removeEventListener("message", fnOnMessage);
				}

				webSocket.removeEventListener("close", fnOnClose);
				webSocket.removeEventListener("error", fnOnError);
			};
			const fnOnMessage = async(messageEvent) => {
				try
				{
					await this.processResponse(messageEvent.data);
				}
				catch(error)
				{
					console.error(error);

					// If processResponse throws then trigger cleanup and start over to avoid any leaks like unresolved .rpc() promises.
					if(webSocket.readyState === JSONRPC.WebSocketAdapters.WebSocketWrapperBase.OPEN)
					{
						webSocket.close(
							/*CLOSE_NORMAL*/ 1000, // Chrome only supports 1000 or the 3000-3999 range ///* CloseEvent.Internal Error */ 1011
							`${error.message}`
						);
					}
				}
			};

			this.on("dispose", fnOnClose);

			if(!this._bBidirectionalWebSocketMode)
			{
				webSocket.addEventListener("message", fnOnMessage);
			}

			webSocket.addEventListener("close", fnOnClose);
			webSocket.addEventListener("error", fnOnError);
		}
		else
		{
			throw new Error("Failed to detect runtime or websocket interface type (browser, nodejs, websockets/ws npm package compatible interface, etc.");
		}
	}
};
