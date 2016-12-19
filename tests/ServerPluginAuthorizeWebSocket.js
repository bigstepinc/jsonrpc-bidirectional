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
	 * @param {JSONRPC.IncomingRequest} incomingRequest
	 */
	async afterJSONDecode(incomingRequest)
	{
		if(incomingRequest.isAuthenticated && incomingRequest.isAuthorized)
		{
			// Nothing to do.
		}
		else if(incomingRequest.requestObject.method === "ImHereForTheParty")
		{
			incomingRequest.isAuthenticated = true;
			incomingRequest.isAuthorized = true;

			// The ImHereForTheParty is an authentication function. 
			// It will throw if not authenticated.
		}
		else if(
			typeof incomingRequest.connectionID === "number" 
			&& this._objSessions.hasOwnProperty(incomingRequest.connectionID)
			&& this._objSessions[incomingRequest.connectionID]
			&& this._objSessions[incomingRequest.connectionID].partyMembership !== null
		)
		{
			incomingRequest.isAuthenticated = true;
			incomingRequest.isAuthorized = this._objSessions[incomingRequest.connectionID].authorized;
		}
	}


	/**
	 * This is called after a function has been called successfully.
	 * 
	 * @param {JSONRPC.IncomingRequest} incomingRequest
	 */
	async result(incomingRequest)
	{
		if(incomingRequest.requestObject.method === "ImHereForTheParty")
		{
			assert(typeof incomingRequest.connectionID === "number");
			
			if(
				this._objSessions.hasOwnProperty(incomingRequest.connectionID)
				&& this._objSessions[incomingRequest.connectionID].partyMembership !== null
			)
			{
				incomingRequest.callResult = new JSONRPC.Exception("Not authorized. Current connnection " + incomingRequest.connectionID + " was already authenticated.", JSONRPC.Exception.NOT_AUTHORIZED);

				return;
			}

			if(!this._objSessions.hasOwnProperty(incomingRequest.connectionID))
			{
				throw new Error("initConnection was not called with connection id " + JSON.stringify(incomingRequest.connectionID) + ".");
			}
			
			assert(!(incomingRequest.callResult instanceof Error));
			this._objSessions[incomingRequest.connectionID].partyMembership = incomingRequest.callResult;
			
			// bDoNotAuthorizeMe param.
			assert(typeof incomingRequest.requestObject.params[2] === "boolean");
			this._objSessions[incomingRequest.connectionID].authorized = !incomingRequest.requestObject.params[2];

			this._objATeamMemberToConnectionID[incomingRequest.callResult.teamMember] = incomingRequest.connectionID;
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
