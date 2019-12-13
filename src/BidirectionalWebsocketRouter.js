const JSONRPC = {
	Exception: require("./Exception"),
	Server: require("./Server"),
	IncomingRequest: require("./IncomingRequest"),
	EndpointBase: require("./EndpointBase"),
	RouterBase: require("./RouterBase"),
	Plugins: {
		Client: require("./Plugins/Client")
	},
	Utils: require("./Utils"),
	WebSocketAdapters: {
		WebSocketWrapperBase: require("./WebSocketAdapters/WebSocketWrapperBase")
	}
};

/**
 * @event madeReverseCallsClient
 * The "madeReverseCallsClient" event offers automatically instantiated API clients (API clients are instantiated for each connection, lazily).
 */
module.exports =
class BidirectionalWebsocketRouter extends JSONRPC.RouterBase
{
	/**
	 * This function must be synchronous, otherwise it will allow of race conditions where critical plugins (if any) haven't been initialized yet.
	 * 
	 * Returns the connection ID.
	 * 
	 * WebSocket instances which will emit an error or close event will get automatically removed.
	 * 
	 * Already closed WebSocket instances are ignored by this function.
	 * 
	 * @param {WebSocket} webSocket
	 * @param {http.IncomingMessage|undefined} upgradeRequest
	 * 
	 * @returns {number}
	 */
	addWebSocketSync(webSocket, upgradeRequest)
	{
		if(webSocket.readyState === JSONRPC.WebSocketAdapters.WebSocketWrapperBase.CLOSED)
		{
			// WebSocket.CLOSING should be followed by a closed event.
			// WebSocket.OPEN is desired.
			// WebSocket.CONNECTING should emit an error event if it will not become open.
			// @TODO: test cases for the above, somehow.

			// WebSocket.CLOSED would not recover and should never be added, because it would not get cleaned up.
			console.log("[" + process.pid + "] addWebSocketSync ignoring closed webSocket.");
			return;
		}

		const nConnectionID = ++this._nConnectionIDCounter;

		const strEndpointPath = JSONRPC.EndpointBase.normalizePath(
			webSocket.url 
				? /*WebSocket client*/ webSocket.url
				: (
					webSocket.upgradeReq 
						? /*ws 2.4*/ webSocket.upgradeReq.url 
						: /*ws >= 4.x*/ upgradeRequest.url
				)
		);

		const objSession = {
			webSocket: webSocket,
			upgradeRequest: webSocket.upgradeReq ? /*ws 2.4*/ webSocket.upgradeReq : /*ws >= 4.x*/ upgradeRequest,
			nConnectionID: nConnectionID,
			clientReverseCalls: null,
			clientWebSocketTransportPlugin: null,
			strEndpointPath: strEndpointPath
		};

		this._objSessions[nConnectionID] = objSession;


		const fnOnError = (error) => {
			this.onConnectionEnded(nConnectionID);

			if(webSocket.readyState === JSONRPC.WebSocketAdapters.WebSocketWrapperBase.OPEN)
			{
				webSocket.close(
					/*CLOSE_NORMAL*/ 1000, // Chrome only supports 1000 or the 3000-3999 range ///* CloseEvent.Internal Error */ 1011, 
					error.message
				);
			}
		};
		

		if(webSocket.on && webSocket.removeListener && process && process.release)
		{
			const fnOnMessage = (strData, objFlags) => {
				this._routeMessage(strData, objSession);
			};
			const fnOnClose = (nCode, strReason) => {
				this.onConnectionEnded(nConnectionID);

				webSocket.removeListener("message", fnOnMessage);
				webSocket.removeListener("close", fnOnClose);
				webSocket.removeListener("error", fnOnError);
			};
			webSocket.on("message", fnOnMessage);
			webSocket.on("close", fnOnClose);
			webSocket.on("error", fnOnError);
		}
		else if(webSocket.addEventListener)
		{
			const fnOnMessage = (messageEvent) => {
				this._routeMessage(messageEvent.data, objSession);
			};
			const fnOnClose = (closeEvent) => {
				//closeEvent.code;
				//closeEvent.reason;
				//closeEvent.wasClean;

				this.onConnectionEnded(nConnectionID);

				webSocket.removeEventListener("message", fnOnMessage);
				webSocket.removeEventListener("close", fnOnClose);
				webSocket.removeEventListener("error", fnOnError);
			};

			webSocket.addEventListener("message", fnOnMessage);
			webSocket.addEventListener("close", fnOnClose);
			webSocket.addEventListener("error", fnOnError);
		}
		else
		{
			throw new Error("Failed to detect runtime or websocket interface not support (browser, nodejs, websockets/ws npm package compatible interface, etc.");
		}


		return nConnectionID;
	}


	/**
	 * Overridable to allow configuring the client further.
	 * 
	 * @param {Class} ClientClass
	 * @param {object} objSession
	 * 
	 * @returns {JSONRPC.Client}
	 */
	_makeReverseCallsClient(ClientClass, objSession)
	{
		const clientReverseCalls = new ClientClass(objSession.strEndpointPath);
		
		objSession.clientWebSocketTransportPlugin = new JSONRPC.Plugins.Client.WebSocketTransport(objSession.webSocket, /*bBidirectionalWebSocketMode*/ true);
		clientReverseCalls.addPlugin(objSession.clientWebSocketTransportPlugin);

		this.emit("madeReverseCallsClient", clientReverseCalls);

		return clientReverseCalls;
	}


	/**
	 * Routes websocket messages to either the client or the server websocket plugin.
	 * 
	 * @param {string} strMessage
	 * @param {object} objSession
	 */
	async _routeMessage(strMessage, objSession)
	{
		const webSocket = objSession.webSocket;
		const nConnectionID = objSession.nConnectionID;

		if(!strMessage.trim().length)
		{
			console.log("[" + process.pid + "] WebSocketBidirectionalRouter: Received empty message. Ignoring.");
			return;
		}

		let objMessage;

		try
		{
			objMessage = JSONRPC.Utils.jsonDecodeSafe(strMessage);
		}
		catch(error)
		{
			console.error(error);
			console.error("Unable to parse JSON. RAW remote message: " + strMessage);

			if(
				this._jsonrpcServer 
				&& this._objSessions.hasOwnProperty(nConnectionID)
				&& this._objSessions[nConnectionID].clientWebSocketTransportPlugin === null
				&& webSocket.readyState === JSONRPC.WebSocketAdapters.WebSocketWrapperBase.OPEN
			)
			{
				webSocket.send(JSON.stringify({
					id: null,
					jsonrpc: "2.0",
					error: {
						message: "Invalid JSON: " + JSON.stringify(strMessage) + ".",
						code: JSONRPC.Exception.PARSE_ERROR
					}
				}, undefined, "\t"));
			}

			console.log("[" + process.pid + "] Unclean state. Unable to match WebSocket message to an existing Promise or qualify it as a request or response.");
			if(webSocket.readyState === JSONRPC.WebSocketAdapters.WebSocketWrapperBase.OPEN)
			{
				webSocket.close(
					/*CLOSE_NORMAL*/ 1000, // Chrome only supports 1000 or the 3000-3999 range ///* CloseEvent.Internal Error */ 1011, 
					"Unclean state. Unable to match WebSocket message to an existing Promise or qualify it as a request or response."
				);
			}

			return;
		}

		let bNotification = !objMessage.hasOwnProperty("id");

		try
		{
			if(objMessage.hasOwnProperty("method"))
			{
				if(!this._jsonrpcServer)
				{
					if(!bNotification && webSocket.readyState === JSONRPC.WebSocketAdapters.WebSocketWrapperBase.OPEN)
					{
						webSocket.send(JSON.stringify({
							id: null,
							jsonrpc: "2.0",
							error: {
								message: "JSONRPC.Server not initialized on this WebSocket. Raw request: " + strMessage + ".",
								code: JSONRPC.Exception.PARSE_ERROR
							}
						}, undefined, "\t"));
					}

					throw new Error("JSONRPC.Server not initialized on this WebSocket");
				}


				const incomingRequest = new JSONRPC.IncomingRequest();

				incomingRequest.connectionID = nConnectionID;
				incomingRequest.router = this;


				if(objSession.upgradeRequest)
				{
					// upgradeReq is a http.IncomingMessage
					incomingRequest.headers = objSession.upgradeRequest.headers;

					incomingRequest.remoteAddress = objSession.upgradeRequest.socket.remoteAddress;
					incomingRequest.localAddress = objSession.upgradeRequest.socket.localAddress;
				}


				try
				{
					const strEndpointPath = this._objSessions[nConnectionID].strEndpointPath;

					if(!this._jsonrpcServer.endpoints.hasOwnProperty(strEndpointPath))
					{
						throw new JSONRPC.Exception("Unknown JSONRPC endpoint " + strEndpointPath + ".", JSONRPC.Exception.METHOD_NOT_FOUND);
					}

					incomingRequest.endpoint = this._jsonrpcServer.endpoints[strEndpointPath];

					incomingRequest.requestBody = strMessage;
					incomingRequest.requestObject = objMessage;
				}
				catch(error)
				{
					incomingRequest.callResult = error;
				}


				await this._jsonrpcServer.processRequest(incomingRequest);
				
				if(webSocket.readyState !== JSONRPC.WebSocketAdapters.WebSocketWrapperBase.OPEN)
				{
					let strAttemptedResponse = JSON.stringify(incomingRequest.callResultToBeSerialized);
					if(strAttemptedResponse.length > 200)
					{
						strAttemptedResponse = strAttemptedResponse.substr(0, 100) + ` <... truncated ${strAttemptedResponse.length - 200} characters ...> ` + strAttemptedResponse.substr(-100);
					}
					console.error("webSocket.readyState: " + JSON.stringify(webSocket.readyState) + ". Request was " + strMessage + ". Attempted responding with " + strAttemptedResponse + ".");
				}

				if(!bNotification)
				{
					webSocket.send(incomingRequest.callResultSerialized);
				}
			}
			else if(objMessage.hasOwnProperty("result") || objMessage.hasOwnProperty("error"))
			{
				if(
					this._objSessions.hasOwnProperty(nConnectionID)
					&& this._objSessions[nConnectionID].clientWebSocketTransportPlugin === null
				)
				{
					if(!this._jsonrpcServer)
					{
						if(!bNotification && webSocket.readyState === JSONRPC.WebSocketAdapters.WebSocketWrapperBase.OPEN)
						{
							webSocket.send(JSON.stringify({
								id: null,
								jsonrpc: "2.0",
								error: {
									message: "JSONRPC.Client not initialized on this WebSocket. Raw message: " + strMessage + ".",
									code: JSONRPC.Exception.PARSE_ERROR
								}
							}, undefined, "\t"));
						}
					}

					if(webSocket.readyState === JSONRPC.WebSocketAdapters.WebSocketWrapperBase.OPEN)
					{
						webSocket.close(
							/*CLOSE_NORMAL*/ 1000, // Chrome only supports 1000 or the 3000-3999 range ///* CloseEvent.Internal Error */ 1011, 
							"How can the client be not initialized, and yet getting responses from phantom requests? Closing websocket."
						);
					}

					throw new Error("How can the client be not initialized, and yet getting responses from phantom requests?");
				}
				
				if(this._objSessions.hasOwnProperty(nConnectionID))
				{
					await this._objSessions[nConnectionID].clientWebSocketTransportPlugin.processResponse(strMessage, objMessage);
				}
				else
				{
					console.error("Connection ID " + nConnectionID + " is closed and session is missing. Ignoring response: " + strMessage);
				}
			}
			else
			{
				// Malformed message, will attempt to send a response.
				bNotification = false;

				throw new Error("Unable to qualify the message as a JSONRPC request or response.");
			}
		}
		catch(error)
		{
			console.error(error);
			console.error("Uncaught error. RAW remote message: " + strMessage);

			if(
				this._jsonrpcServer 
				&& this._objSessions.hasOwnProperty(nConnectionID)
				&& this._objSessions[nConnectionID].clientWebSocketTransportPlugin === null
			)
			{
				if(!bNotification && webSocket.readyState === JSONRPC.WebSocketAdapters.WebSocketWrapperBase.OPEN)
				{
					webSocket.send(JSON.stringify({
						id: null,
						jsonrpc: "2.0",
						error: {
							message: "Internal error: " + error.message + ".",
							code: JSONRPC.Exception.INTERNAL_ERROR
						}
					}, undefined, "\t"));
				}
			}

			if(webSocket.readyState === JSONRPC.WebSocketAdapters.WebSocketWrapperBase.OPEN)
			{
				console.log("[" + process.pid + "] Unclean state. Closing websocket.");
				webSocket.close(
					/*CLOSE_NORMAL*/ 1000, // Chrome only supports 1000 or the 3000-3999 range ///* CloseEvent.Internal Error */ 1011, 
					"Unclean state. Closing websocket."
				);
			}

			return;
		}
	}
};
