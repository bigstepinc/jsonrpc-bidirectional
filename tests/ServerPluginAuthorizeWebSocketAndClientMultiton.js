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
		this._objATeamMemberToConnectionID = {};

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
			&& this._objSessions[jsonrpcRequest.connectionID].partyMembership !== null
		)
		{
			jsonrpcRequest.isAuthenticated = true;
			jsonrpcRequest.isAuthorized = this._objSessions[jsonrpcRequest.connectionID].authorized;
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
			assert(typeof jsonrpcRequest.connectionID === "number");
			
			if(
				this._objSessions.hasOwnProperty(jsonrpcRequest.connectionID)
				&& this._objSessions[jsonrpcRequest.connectionID].partyMembership !== null
			)
			{
				jsonrpcRequest.callResult = new JSONRPC.Exception("Not authorized. Current connnection " + jsonrpcRequest.connectionID + " was already authenticated.", JSONRPC.Exception.NOT_AUTHORIZED);

				return;
			}

			if(!this._objSessions.hasOwnProperty(jsonrpcRequest.connectionID))
			{
				throw new Error("initConnection was not called with connection id " + JSON.stringify(jsonrpcRequest.connectionID) + ".");
			}
			
			assert(!(jsonrpcRequest.callResult instanceof Error));
			this._objSessions[jsonrpcRequest.connectionID].partyMembership = jsonrpcRequest.callResult;
			
			// bDoNotAuthorizeMe param.
			assert(typeof jsonrpcRequest.requestObject.params[2] === "boolean");
			this._objSessions[jsonrpcRequest.connectionID].authorized = !jsonrpcRequest.requestObject.params[2];

			this._objATeamMemberToConnectionID[jsonrpcRequest.callResult.teamMember] = jsonrpcRequest.connectionID;
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
			partyMembership: null, 
			authorized: false, 
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


	/**
	 * @param {string} strATeamMember
	 * 
	 * @returns {JSONRPC.Client}
	 */
	aTeamMemberToConnectionID(strATeamMember)
	{
		if(!this._objATeamMemberToConnectionID.hasOwnProperty(strATeamMember))
		{
			throw new Error("The team member is not logged in!!!");
		}

		return this._objATeamMemberToConnectionID[strATeamMember];
	}
};
