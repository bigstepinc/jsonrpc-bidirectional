const JSONRPC = require("../../index");

module.exports =
class TestClient extends JSONRPC.Client
{
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
		return this.rpc("ping", [...arguments]);
	}


	/**
	 * Hello world?
	 * 
	 * @returns {string}
	 */
	async throwJSONRPCException()
	{
		return this.rpc("throwJSONRPCException", [...arguments]);
	}


	/**
	 * Hello world?
	 * 
	 * @returns {string}
	 */
	async throwError()
	{
		return this.rpc("throwError", [...arguments]);
	}


	/**
	 * Authentication function. 
	 * 
	 * @param {string} strTeamMember
	 * @param {string} strSecretKnock
	 * @param {boolean} bDoNotAuthorizeMe
	 * 
	 * @returns {{teamMember: {string}}}
	 */
	async ImHereForTheParty(strTeamMember, strSecretKnock, bDoNotAuthorizeMe)
	{
		return this.rpc("ImHereForTheParty", [...arguments]);
	}


	/**
	 * @param {number} nPID 
	 * @returns {never}
	 */
	async killWorker(nPID)
	{
		return this.rpc("killWorker", [...arguments]);
	}
};
