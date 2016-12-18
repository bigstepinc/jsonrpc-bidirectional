const sleep = require("sleep-promise");

const JSONRPC = {};
JSONRPC.Exception = require("../src/Exception");
JSONRPC.EndpointBase = require("../src/EndpointBase");

module.exports =
class TestEndpoint extends JSONRPC.EndpointBase 
{
	constructor()
	{
		super(
			/*strName*/ "Test", 
			/*strPath*/ "/api", 
			/*objReflection*/ {}
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
	 * @param {string} strReturn
	 * @param {boolean} bRandomSleep
	 * @param {string|null} strATeamCharacterName
	 * 
	 * @returns {string}
	 */
	async ping(strReturn, bRandomSleep, strATeamCharacterName)
	{
		if(bRandomSleep)
		{
			//await sleep(parseInt(Math.random() * 1000 /*milliseconds*/, 10));
		}

		if(typeof strATeamCharacterName === "string")
		{
			const nConnectionID = this._serverPluginAuthorizeWebSocketAndClientMultitonSiteA.aTeamMemberToConnectionID(strATeamCharacterName);

			const reverseCallsClient = this._serverPluginAuthorizeWebSocketAndClientMultitonSiteA.connectionIDToClient(nConnectionID);

			await reverseCallsClient.rpc("ping", [strATeamCharacterName + " called back to confirm this: " + strReturn + "!", /*bRandomSleep*/ true]);
		}

		return strReturn;
	}


	/**
	 * Hello world?
	 * 
	 * @returns {string}
	 */
	async throwJSONRPCException()
	{
		throw new JSONRPC.Exception("JSONRPC.Exception", JSONRPC.Exception.INTERNAL_ERROR);
	}


	/**
	 * Hello world?
	 * 
	 * @returns {string}
	 */
	async throwError()
	{
		throw new Error("Error");
	}


	/**
	 * Authentication function. 
	 * 
	 * It is intercepted by ServerPluginAuthorizeWebSocketAndClientMultiton.
	 * If it doesn't throw, it will remember that the websocket connection is authenticated.
	 * 
	 * @param {string} strTeamMember
	 * @param {string} strSecretKnock
	 * @param {boolean} bDoNotAuthorizeMe
	 * 
	 * @returns {{teamMember: {string}}}
	 */
	async ImHereForTheParty(strTeamMember, strSecretKnock, bDoNotAuthorizeMe)
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
