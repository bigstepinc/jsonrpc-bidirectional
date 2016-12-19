const sleep = require("sleep-promise");

const JSONRPC = {};
JSONRPC.Exception = require("../src/Exception");
JSONRPC.Client = require("../src/Client");
JSONRPC.EndpointBase = require("../src/EndpointBase");

module.exports =
class TestEndpoint extends JSONRPC.EndpointBase 
{
	constructor()
	{
		super(
			/*strName*/ "Test", 
			/*strPath*/ "/api", 
			/*objReflection*/ {},
			/*classReverseCallsClient*/ JSONRPC.Client
		);

		this._serverPluginAuthorizeWebSocketAndClientMultitonSiteA = null;
		//Object.seal(this);
	}


	/**
	 * @param {ServerPluginAuthorizeWebSocketAndClientMultiton} serverPluginAuthorizeWebSocketAndClientMultitonSiteA
	 */
	set serverPluginAuthorizeWebSocketAndClientMultitonSiteA(serverPluginAuthorizeWebSocketAndClientMultitonSiteA)
	{
		this._serverPluginAuthorizeWebSocketAndClientMultitonSiteA = serverPluginAuthorizeWebSocketAndClientMultitonSiteA;
	}


	/**
	 * Hello world?
	 * 
	 * @param {JSONRPC.IncomingRequest} incomingRequest
	 * @param {string} strReturn
	 * @param {boolean} bRandomSleep
	 * @param {string|null} strATeamCharacterName
	 * 
	 * @returns {string}
	 */
	async ping(incomingRequest, strReturn, bRandomSleep, strATeamCharacterName)
	{
		if(bRandomSleep)
		{
			await sleep(parseInt(Math.random() * 1000 /*milliseconds*/, 10));
		}

		if(typeof strATeamCharacterName === "string")
		{
			const reverseCallsClient = incomingRequest.bidirectionalWebsocketRouter.connectionIDToClient(incomingRequest.connectionID, JSONRPC.Client);
			
			await reverseCallsClient.rpc("ping", [strATeamCharacterName + " called back to confirm this: " + strReturn + "!", /*bRandomSleep*/ true]);
		}

		return strReturn;
	}


	/**
	 * Hello world?
	 * 
	 * @param {JSONRPC.IncomingRequest} incomingRequest
	 * 
	 * @returns {string}
	 */
	async throwJSONRPCException(incomingRequest)
	{
		throw new JSONRPC.Exception("JSONRPC.Exception", JSONRPC.Exception.INTERNAL_ERROR);
	}


	/**
	 * Hello world?
	 * 
	 * @param {JSONRPC.IncomingRequest} incomingRequest
	 * 
	 * @returns {string}
	 */
	async throwError(incomingRequest)
	{
		throw new Error("Error");
	}


	/**
	 * Authentication function. 
	 * 
	 * It is intercepted by ServerPluginAuthorizeWebSocketAndClientMultiton.
	 * If it doesn't throw, it will remember that the websocket connection is authenticated.
	 * 
	 * @param {JSONRPC.IncomingRequest} incomingRequest
	 * @param {string} strTeamMember
	 * @param {string} strSecretKnock
	 * @param {boolean} bDoNotAuthorizeMe
	 * 
	 * @returns {{teamMember: {string}}}
	 */
	async ImHereForTheParty(incomingRequest, strTeamMember, strSecretKnock, bDoNotAuthorizeMe)
	{
		const arrTheATeam = ["Hannibal", "Face", "Baracus", "Murdock", "Lynch"];
		
		if(!arrTheATeam.includes(strTeamMember))
		{
			throw new JSONRPC.Exception("We don't let strangers in.", JSONRPC.Exception.NOT_AUTHENTICATED);
		}

		if(strSecretKnock !== (strTeamMember + " does the harlem shake"))
		{
			throw new JSONRPC.Exception("You don't dance like " + strTeamMember + ". Who are you?", JSONRPC.Exception.NOT_AUTHENTICATED);
		}

		return {
			"teamMember": strTeamMember
		};
	}
};
