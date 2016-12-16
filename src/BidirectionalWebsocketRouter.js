const assert = require("assert");

const JSONRPC = {};
JSONRPC.Exception = require("./Exception");
JSONRPC.Server = require("./Server");
JSONRPC.IncomingRequest = require("./IncomingRequest");
JSONRPC.EndpointBase = require("./EndpointBase");

JSONRPC.Plugins = {};
JSONRPC.Plugins.Client = require("./Plugins/Client/index");
JSONRPC.Utils = require("./Utils");

module.exports =
class BidirectionalWebsocketRouter
{
	/**
	 * If both the client and server plugins are specified, bi-directional JSONRPC over the same websocket is enabled.
	 * 
	 * @param {Function|null} fnConnectionIDToClientWebSocketPlugin
	 * @param {JSONRPC.Server|null} jsonrpcServer
	 */
	constructor(fnConnectionIDToClientWebSocketPlugin, jsonrpcServer)
	{
		assert(fnConnectionIDToClientWebSocketPlugin === null || typeof fnConnectionIDToClientWebSocketPlugin === "function");
		assert(jsonrpcServer === null || jsonrpcServer instanceof JSONRPC.Server);

		this._fnConnectionIDToClientWebSocketPlugin = fnConnectionIDToClientWebSocketPlugin;
		this._jsonrpcServer = jsonrpcServer;
	}


	/**
	 * Routes websocket messages to either the client or the server websocket plugin.
	 * 
	 * @param {string} strMessage
	 * @param {WebSocket} webSocket
	 * @param {number} nWebSocketConnectionID
	 */
	async routeMessage(strMessage, webSocket, nWebSocketConnectionID)
	{
		if(!strMessage.length)
		{
			console.log("WebSocketBidirectionalRouter: Received empty message. Ignoring.");
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

			if(this._jsonrpcServer && !this._fnConnectionIDToClientWebSocketPlugin)
			{
				webSocket.send(JSON.stringify({
					id: null,
					jsonrpc: "2.0",
					error: {
						message: "Invalid request: " + JSON.stringify(strMessage) + ".",
						code: JSONRPC.Exception.PARSE_ERROR
					}
				}, undefined, "\t"));
			}

			console.log("Unclean state. Unable to match WebSocket message to an existing Promise or qualify it as a request or response.");
			webSocket.close(
				/* CloseEvent.Internal Error */ 1011, 
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
					webSocket.send(JSON.stringify({
						id: null,
						jsonrpc: "2.0",
						error: {
							message: "Invalid JSON: " + JSON.stringify(strMessage) + ".",
							code: JSONRPC.Exception.PARSE_ERROR
						}
					}, undefined, "\t"));
				}


				const jsonrpcRequest = new JSONRPC.IncomingRequest();

				jsonrpcRequest.connectionID = nWebSocketConnectionID;


				// Move this somewhere in a state tracking class instance of the websocket connection so it is only executed on an incoming connection,
				// for efficiency.
				try
				{
					const strPath = JSONRPC.EndpointBase.normalizePath(webSocket.url ? webSocket.url : webSocket.upgradeReq.url);

					if(!this._jsonrpcServer.endpoints.hasOwnProperty(strPath))
					{
						throw new JSONRPC.Exception("Unknown JSONRPC endpoint " + strPath + ".", JSONRPC.Exception.METHOD_NOT_FOUND);
					}
					jsonrpcRequest.endpoint = this._jsonrpcServer.endpoints[strPath];


					jsonrpcRequest.requestBody = strMessage;
					jsonrpcRequest.requestObject = objMessage;
				}
				catch(error)
				{
					jsonrpcRequest.callResult = error;
				}


				const objResponse = await this._jsonrpcServer.processRequest(jsonrpcRequest);
				webSocket.send(JSON.stringify(objResponse));
			}
			else if(objMessage.hasOwnProperty("result") || objMessage.hasOwnProperty("error"))
			{
				await this._fnConnectionIDToClientWebSocketPlugin(nWebSocketConnectionID).processResponse(strMessage, objMessage);
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

			if(this._jsonrpcServer && !this._fnConnectionIDToClientWebSocketPlugin)
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

			console.log("Unclean state. Closing websocket.");
			webSocket.close(
				/* CloseEvent.Internal Error */ 1011, 
				"Unclean state. Closing websocket."
			);

			return;
		}
	}
};
