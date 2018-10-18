const JSONRPC = require("../../../../index");

const assert = require("assert");

module.exports =
class WebSocketAuthorize extends JSONRPC.ServerPluginBase
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
				// Maybe race condition somewhere from alternating authenticated IDs.
				incomingRequest.callResult = new JSONRPC.Exception("Not authorized. Current connnection " + incomingRequest.connectionID + " was already authenticated.", JSONRPC.Exception.NOT_AUTHORIZED);

				return;
			}

			if(!this._objSessions.hasOwnProperty(incomingRequest.connectionID))
			{
				throw new Error("addConnection was not called with connection id " + JSON.stringify(incomingRequest.connectionID) + ".");
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
	 * @param {WebSocket} webSocket
	 */
	addConnection(nWebSocketConnectionID, webSocket)
	{
		assert(typeof nWebSocketConnectionID === "number");

		this._objSessions[nWebSocketConnectionID] = {
			partyMembership: null, 
			authorized: false, 
			connectionID: nWebSocketConnectionID
		};

		webSocket.on(
			"close",
			(code, message) => {
				if(
					this._objSessions.hasOwnProperty(nWebSocketConnectionID)
					&& this._objSessions[nWebSocketConnectionID].partyMembership
					&& this._objATeamMemberToConnectionID.hasOwnProperty(this._objSessions[nWebSocketConnectionID].partyMembership.teamMember)
				)
				{
					delete this._objATeamMemberToConnectionID[this._objSessions[nWebSocketConnectionID].partyMembership.teamMember];
				}

				delete this._objSessions[nWebSocketConnectionID];
			}
		);
	}


	/**
	 * @param {string} strATeamMember
	 * 
	 * @returns {number}
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
