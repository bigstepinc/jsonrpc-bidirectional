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

		Object.seal(this);
	}


	/**
	 * Hello world?
	 * 
	 * @param {string} strReturn
	 * 
	 * @returns {string}
	 */
	async ping(strReturn)
	{
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
	 * 
	 * @returns {{teamMember: {string}}}
	 */
	async ImHereForTheParty(strTeamMember, strSecretKnock)
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
