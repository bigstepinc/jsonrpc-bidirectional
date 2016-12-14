const JSONRPC = {};
JSONRPC.ServerPluginBase = require("../src/ServerPluginBase");
JSONRPC.Exception = require("../src/Exception");

JSONRPC.Plugins = {};
JSONRPC.Plugins.Client = require("../src/Plugins/Client/index");
JSONRPC.Utils = require("../src/Utils");

const WebSocket = require("ws");

const assert = require("assert");

module.exports =
class ServerPluginAuthorizeWebSocketAndClientMultiton extends JSONRPC.ServerPluginBase
{
	constructor()
	{
		super();

		this._objSessions = {};

		Object.seal(this);
	}


	/**
	 * Called after JSON parsing of the JSONRPC request.
	 * 
	 * @override
	 * 
	 * @param {JSONRPC.IncomingRequest} jsonrpcRequest
	 */
	async afterJSONDecode(jsonrpcRequest)
	{
		if(jsonrpcRequest.isAuthenticated && jsonrpcRequest.isAuthorized)
		{
			// Nothing to do.
		}
		else if(jsonrpcRequest.requestObject.method === "ImHereForTheParty")
		{
			jsonrpcRequest.isAuthenticated = true;
			jsonrpcRequest.isAuthorized = true;

			// The ImHereForTheParty is an authentication function. 
			// It will throw if not authenticated.
		}
		else if(
			typeof jsonrpcRequest.connectionID === "number" 
			&& this._objSessions.hasOwnProperty(jsonrpcRequest.connectionID)
			&& this._objSessions[jsonrpcRequest.connectionID]
			&& this._objSessions[jsonrpcRequest.connectionID].authorization !== null
		)
		{
			jsonrpcRequest.isAuthenticated = true;
			jsonrpcRequest.isAuthorized = true;
		}
	}


	/**
	 * This is called after a function has been called successfully.
	 * 
	 * @param {JSONRPC.IncomingRequest} jsonrpcRequest
	 */
	async result(jsonrpcRequest)
	{
		if(jsonrpcRequest.requestObject.method === "ImHereForTheParty")
		{
			assert(typeof this.jsonrpcRequest.connectionID === "number");
			
			if(
				this._objSessions.hasOwnProperty(jsonrpcRequest.connectionID)
				&& typeof this._objSessions[jsonrpcRequest.connectionID].authorization === "object" 
			)
			{
				jsonrpcRequest.callResult = new JSONRPC.Exception("Not authorized. Current connnection was already authenticated.", JSONRPC.Exception.NOT_AUTHORIZED);

				return;
			}

			if(!this._objSessions.hasOwnProperty(jsonrpcRequest.connectionID))
			{
				throw new Error("initConnection was not called with connection id " + JSON.stringify(jsonrpcRequest.connectionID) + ".");
			}
			
			assert(!(jsonrpcRequest.callResult instanceof Error));
			this._objSessions[jsonrpcRequest.connectionID].authorization = jsonrpcRequest.callResult;
		}
	}


	/**
	 * @param {number} nWebSocketConnectionID
	 * @param {JSONRPC.Client} clientReverseCalls
	 * @param {WebSocket} webSocket
	 */
	initConnection(nWebSocketConnectionID, clientReverseCalls, webSocket)
	{
		this._objSessions[nWebSocketConnectionID] = {
			authorization: null, 
			connectionID: nWebSocketConnectionID, 
			clientReverseCalls: clientReverseCalls,
			clientWebSocketPlugin: null
		};

		for(let plugin of clientReverseCalls.plugins)
		{
			if(plugin instanceof JSONRPC.Plugins.Client.WebSocketTransport)
			{
				this._objSessions[nWebSocketConnectionID].clientWebSocketPlugin = plugin;
				break;
			}
		}
		if(!this._objSessions[nWebSocketConnectionID].clientWebSocketPlugin)
		{
			throw new Error("The client must have the WebSocketTransport plugin added.");
		}

		webSocket.on(
			"close",
			(code, message) => {
				delete this._objSessions[nWebSocketConnectionID];
			}
		);

		webSocket.on(
			"error",
			(error) => {
				delete this._objSessions[nWebSocketConnectionID];

				if(webSocket.readyState === WebSocket.OPEN)
				{
					webSocket.close(
						/* CloseEvent.Internal Error */ 1011, 
						error.message
					);
				}
			}
		);
	}


	/**
	 * @param {number} nConnectionID
	 * 
	 * @returns {JSONRPC.Client}
	 */
	connectionIDToClientWebSocketPlugin(nConnectionID)
	{
		if(!this._objSessions.hasOwnProperty(nConnectionID))
		{
			throw new Error("initConnection was not called with connection id " + JSON.stringify(nConnectionID) + " or the connection was closed in the meantime.");
		}

		return this._objSessions[nConnectionID].clientWebSocketPlugin;
	}


	/**
	 * @param {number} nConnectionID
	 * 
	 * @returns {JSONRPC.Client}
	 */
	connectionIDToClient(nConnectionID)
	{
		if(!this._objSessions.hasOwnProperty(nConnectionID))
		{
			throw new Error("initConnection was not called with connection id " + JSON.stringify(nConnectionID) + " or the connection was closed in the meantime.");
		}

		return this._objSessions[nConnectionID].clientReverseCalls;
	}
};
