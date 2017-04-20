"use strict";
/* eslint-disable */

/**
 * @class
 */
function TestEndpoint()
{
	JSONRPC.EndpointBase.prototype.constructor.apply(
		this,
		[
			/*strName*/ "Test", 
			/*strPath*/ location.protocol + "//" + location.host + '/api',  // /api, replaced / with \x2F because issues.
			/*objReflection*/ {},
			/*classReverseCallsClient*/ JSONRPC.Client
		]
	);
}

TestEndpoint.prototype = new JSONRPC.EndpointBase("TestEndpoint", "/api", {});
TestEndpoint.prototype.constructor = JSONRPC.EndpointBase;


/**
 * @param {JSONRPC.IncomingRequest} incomingRequest
 * @param {string} strReturn
 * @param {boolean} bRandomSleep
 * @param {string|null} strATeamCharacterName
 * 
 * @returns {Promise.<string>}
 */
TestEndpoint.prototype.ping = function(incomingRequest, strReturn, RandomSleep, strATeamCharacterName){
	return new Promise(function(fnResolve, fnReject){
		if(typeof strATeamCharacterName === "string")
		{
			var strReturn;
			if(strATeamCharacterName === "CallMeBackOnceAgain")
			{
				strReturn = "Calling you back once again";
			}
			else
			{
				strReturn = strATeamCharacterName + " called back to confirm this: " + strReturn + ".";
			}

			incomingRequest.reverseCallsClient.rpc("ping", [strReturn, /*bRandomSleep*/ true])
				.then(function(strPingResult){
					window.arrErrors.push(strPingResult);

					fnResolve(strPingResult);
				})
				.catch(function(error){
					if(window.arrErrors)
					{
						window.arrErrors.push(error);
					}

					fnReject(error);
				})
			;
		}
		else
		{
			fnResolve(strReturn);
		}
	});
};
