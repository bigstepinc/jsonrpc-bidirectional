"use strict";
/* eslint-disable */

/**
 * Keep everything IE10 compatible, so it can be tested there as well.
 * 
 * @class
 */
function TestEndpoint()
{
	JSONRPC.EndpointBase.prototype.constructor.apply(
		this,
		[
			/*strName*/ "Test", 
			/*strPath*/ location.protocol + "//" + location.host + "/api", 
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
			var strReturnReverseCall;
			if(strATeamCharacterName === "CallMeBackOnceAgain")
			{
				strReturnReverseCall = "Calling you back once again";
			}
			else
			{
				strReturnReverseCall = strATeamCharacterName + " called back to confirm this: " + strReturn + ".";
			}

			incomingRequest.reverseCallsClient.rpc("ping", [strReturnReverseCall, /*bRandomSleep*/ true])
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
