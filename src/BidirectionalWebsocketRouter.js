const assert = require("assert");

const JSONRPC = {};
JSONRPC.Exception = require("./Exception");
JSONRPC.Server = require("./Server");
JSONRPC.IncomingRequest = require("./IncomingRequest");
JSONRPC.EndpointBase = require("./EndpointBase");

JSONRPC.Plugins = {};
JSONRPC.Plugins.Client = require("./Plugins/Client");
JSONRPC.Utils = require("./Utils");

const EventEmitter = require("events");

const WebSocket = require("ws");


/**
 * The "madeReverseCallsClient" event offers automatically instantiated API clients (API clients are instantiated for each connection, lazily).
 */
module.exports =
class BidirectionalWebsocketRouter extends EventEmitter
{
	/**
	 * Clients are automatically instantiated per connection and are available as a property of the first param of the exported functions,
	 * if the JSONRPC.EndpointBase constructor param classReverseCallsClient was set to a JSONRPC.Client subclass.
	 * 
	 * If jsonrpcServer is non-null and classReverseCallsClient is set on at least one endpoint, then bi-directional JSONRPC over the same websocket is enabled.
	 * 
	 * @param {JSONRPC.Server|null} jsonrpcServer
	 */
	constructor(jsonrpcServer)
	{
		super();

		assert(jsonrpcServer === null || jsonrpcServer instanceof JSONRPC.Server);

		this._jsonrpcServer = jsonrpcServer;

		if(!BidirectionalWebsocketRouter.hasOwnProperty("_nServerWebSocketConnectionIDCounter"))
		{
			BidirectionalWebsocketRouter._nServerWebSocketConnectionIDCounter = Math.max(parseInt(new Date().getTime() / 1000, 10) - 1483826328, 0);
		}

		this._objSessions = {};
	}


	/**
	 * Returns the connection ID.
	 * 
	 * WebSocket instances which will emit an error or close event will get automatically removed.
	 * 
	 * Already closed WebSocket instances are ignored by this function.
	 * 
	 * @param {WebSocket} webSocket
	 * 
	 * @returns {number}
	 */
	async addWebSocket(webSocket)
	{
		if(webSocket.readyState === WebSocket.CLOSED)
		{
			// WebSocket.CLOSING should be followed by a closed event.
			// WebSocket.OPEN is desired.
			// WebSocket.CONNECTING should emit an error event if it will not become open.
			// @TODO: test cases for the above, somehow.

			// WebSocket.CLOSED would not recover and should never be added, because it would not get cleaned up.
			console.log("[" + process.pid + "] addWebSocket ignoring closed webSocket.");
			return;
		}

		const nWebSocketConnectionID = ++BidirectionalWebsocketRouter._nServerWebSocketConnectionIDCounter;


		const objSession = {
			webSocket: webSocket,
			nWebSocketConnectionID: nWebSocketConnectionID,
			clientReverseCalls: null,
			clientWebSocketTransportPlugin: null
		};

		this._objSessions[nWebSocketConnectionID] = objSession;

		webSocket.addEventListener(
			"close",
			(closeEvent) => {
				//closeEvent.code;
				//closeEvent.reason;
				//closeEvent.wasClean;

				delete this._objSessions[nWebSocketConnectionID];
			}
		);

		webSocket.addEventListener(
			"error",
			(error) => {
				delete this._objSessions[nWebSocketConnectionID];

				if(webSocket.readyState === WebSocket.OPEN)
				{
					webSocket.close(
						/*CLOSE_NORMAL*/ 1000, // Chrome only supports 1000 or the 3000-3999 range ///* CloseEvent.Internal Error */ 1011, 
						error.message
					);
				}
			}
		);

		webSocket.addEventListener(
			"message", 
			async (messageEvent) => 
			{
				await this._routeMessage(messageEvent.data, objSession);//.then(() => {}).catch(console.error);
			}
		);

		return nWebSocketConnectionID;
	}


	/**
	 * If the client does not exist, it will be generated and saved on the session.
	 * Another client will not be generated automatically, regardless of the accessed endpoint's defined client class for reverse calls.
	 * 
	 * @param {number} nConnectionID
	 * @param {Class} ClientClass
	 * 
	 * @returns {JSONRPC.Client}
	 */
	connectionIDToSingletonClient(nConnectionID, ClientClass)
	{
		assert(typeof nConnectionID === "number");
		assert(typeof ClientClass === "function", "Invalid ClientClass value: " + (typeof ClientClass));

		if(!this._objSessions.hasOwnProperty(nConnectionID))
		{
			throw new Error("Connection " + JSON.stringify(nConnectionID) + " not found in BidirectionalWebsocketRouter.");
		}

		if(this._objSessions[nConnectionID].clientReverseCalls === null)
		{
			this._objSessions[nConnectionID].clientReverseCalls = this._makeReverseCallsClient(
				this._objSessions[nConnectionID].webSocket,
				ClientClass,
				this._objSessions[nConnectionID]
			);
		}
		else
		{
			assert(
				this._objSessions[nConnectionID].clientReverseCalls instanceof ClientClass, 
				"clientReverseCalls already initialized with a different JSONRPC.Client subclass."
			);
		}

		return this._objSessions[nConnectionID].clientReverseCalls;
	}


	/**
	 * Overridable to allow configuring the client further.
	 * 
	 * @param {WebSocket} webSocket
	 * @param {Class} ClientClass
	 * @param {Object} objSession
	 * 
	 * @returns {JSONRPC.Client}
	 */
	_makeReverseCallsClient(webSocket, ClientClass, objSession)
	{
		const clientReverseCalls = new ClientClass(webSocket.url ? webSocket.url : webSocket.upgradeReq.url);
		
		objSession.clientWebSocketTransportPlugin = new JSONRPC.Plugins.Client.WebSocketTransport(webSocket, /*bBidirectionalWebSocketMode*/ true);
		clientReverseCalls.addPlugin(objSession.clientWebSocketTransportPlugin);

		this.emit("madeReverseCallsClient", clientReverseCalls);

		return clientReverseCalls;
	}


	/**
	 * Routes websocket messages to either the client or the server websocket plugin.
	 * 
	 * @param {string} strMessage
	 * @param {Object} objSession
	 */
	async _routeMessage(strMessage, objSession)
	{
		const webSocket = objSession.webSocket;
		const nWebSocketConnectionID = objSession.nWebSocketConnectionID;

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
				&& this._objSessions.hasOwnProperty(nWebSocketConnectionID)
				&& this._objSessions[nWebSocketConnectionID].clientWebSocketTransportPlugin === null
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
			webSocket.close(
				/*CLOSE_NORMAL*/ 1000, // Chrome only supports 1000 or the 3000-3999 range ///* CloseEvent.Internal Error */ 1011, 
				"Unclean state. Unable to match WebSocket message to an existing Promise or qualify it as a request or response."
			);

			return;
		}

		try
		{
			if(objMessage.hasOwnProperty("method"))
			{
				if(!this._jsonrpcServer)
				{
					if(webSocket.readyState === WebSocket.OPEN)
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

				incomingRequest.connectionID = nWebSocketConnectionID;
				incomingRequest.bidirectionalWebsocketRouter = this;


				if(webSocket.upgradeReq)
				{
					// upgradeReq is a http.IncomingMessage
					incomingRequest.headers = webSocket.upgradeReq.headers;

					incomingRequest.remoteAddress = webSocket.upgradeReq.socket.remoteAddress;
				}


				// Move this somewhere in a state tracking class instance of the websocket connection so it is only executed on an incoming connection,
				// for efficiency.
				try
				{
					const strPath = JSONRPC.EndpointBase.normalizePath(webSocket.url ? webSocket.url : webSocket.upgradeReq.url);

					if(!this._jsonrpcServer.endpoints.hasOwnProperty(strPath))
					{
						throw new JSONRPC.Exception("Unknown JSONRPC endpoint " + strPath + ".", JSONRPC.Exception.METHOD_NOT_FOUND);
					}
					incomingRequest.endpoint = this._jsonrpcServer.endpoints[strPath];


					incomingRequest.requestBody = strMessage;
					incomingRequest.requestObject = objMessage;
				}
				catch(error)
				{
					incomingRequest.callResult = error;
				}


				await this._jsonrpcServer.processRequest(incomingRequest);
				
				if(webSocket.readyState !== WebSocket.OPEN)
				{
					console.error("webSocket.readyState: " + JSON.stringify(webSocket.readyState) + ". Request was " + strMessage + ". Attempted responding with " + JSON.stringify(incomingRequest.callResultToBeSerialized, undefined, "\t") + ".");
				}

				webSocket.send(incomingRequest.callResultSerialized);
			}
			else if(objMessage.hasOwnProperty("result") || objMessage.hasOwnProperty("error"))
			{
				if(
					this._objSessions.hasOwnProperty(nWebSocketConnectionID)
					&& this._objSessions[nWebSocketConnectionID].clientWebSocketTransportPlugin === null
				)
				{
					if(!this._jsonrpcServer)
					{
						if(webSocket.readyState === WebSocket.OPEN)
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

					if(webSocket.readyState === WebSocket.OPEN)
					{
						webSocket.close(
							/*CLOSE_NORMAL*/ 1000, // Chrome only supports 1000 or the 3000-3999 range ///* CloseEvent.Internal Error */ 1011, 
							"How can the client be not initialized, and yet getting responses from phantom requests? Closing websocket."
						);
					}

					throw new Error("How can the client be not initialized, and yet getting responses from phantom requests?");
				}
				
				if(this._objSessions.hasOwnProperty(nWebSocketConnectionID))
				{
					await this._objSessions[nWebSocketConnectionID].clientWebSocketTransportPlugin.processResponse(strMessage, objMessage);
				}
				else
				{
					console.error("Connection ID " + nWebSocketConnectionID + " is closed and session is missing. Ignoring response: " + strMessage);
				}
			}
			else
			{
				throw new Error("Unable to qualify the message as a JSONRPC request or response.");
			}
		}
		catch(error)
		{
			console.error(error);
			console.error("Uncaught error. RAW remote message: " + strMessage);

			if(
				this._jsonrpcServer 
				&& this._objSessions.hasOwnProperty(nWebSocketConnectionID)
				&& this._objSessions[nWebSocketConnectionID].clientWebSocketTransportPlugin === null
			)
			{
				if(webSocket.readyState === WebSocket.OPEN)
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

			if(webSocket.readyState === WebSocket.OPEN)
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
