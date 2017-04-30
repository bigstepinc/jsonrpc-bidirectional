const sleep = require("sleep-promise");

const cluster = require("cluster");

const JSONRPC = {};
JSONRPC.Exception = require("../src/Exception");
JSONRPC.Client = require("../src/Client");
JSONRPC.EndpointBase = require("../src/EndpointBase");

JSONRPC.Plugins = {};
JSONRPC.Plugins.Client = require("../src/Plugins/Client");

const TestClient = require("./TestClient");

module.exports =
class TestEndpoint extends JSONRPC.EndpointBase 
{
	/**
	 * @param {boolean} bBenchmarkMode
	 */
	constructor(bBenchmarkMode)
	{
		super(
			/*strName*/ "Test", 
			/*strPath*/ "/api", 
			/*objReflection*/ {},
			/*classReverseCallsClient*/ TestClient
		);

		this._bBenchmarkMode = !!bBenchmarkMode;

		this.fnResolveWaitForWebPage = null;
		this.nWaitForWebPageRemainingCallsCount = null;

		//Object.seal(this);
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
		if(bRandomSleep && !this._bBenchmarkMode)
		{
			await sleep(parseInt(Math.random() * 1000 /*milliseconds*/, 10));
		}

		if(typeof strATeamCharacterName === "string")
		{
			await incomingRequest.reverseCallsClient.rpc("ping", [strATeamCharacterName + " called back to confirm this: " + strReturn + "!", /*bRandomSleep*/ true]);
		}
		else if(strReturn === "Calling from html es5 client, bidirectional websocket mode.")
		{
			await incomingRequest.reverseCallsClient.rpc("ping", ["This is node. You, the browser, called back earlier to confirm this: " + strReturn + "!", /*bRandomSleep*/ false, "CallMeBackOnceAgain"]);
		}

		if(
			this.fnResolveWaitForWebPage !== null
			&& --this.nWaitForWebPageRemainingCallsCount === 0
		)
		{
			this.fnResolveWaitForWebPage();
			this.fnResolveWaitForWebPage = null;
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
	 * If a reverseCallsClient is available, obtain the WebSocket from it and close it.
	 * 
	 * If bTerminate is true, terminate the WebSocket instead of closing it.
	 * 
	 * @param {JSONRPC.IncomingRequest} incomingRequest
	 * @param {boolean} bTerminate
	 * 
	 * @returns {null}
	 */
	async closeConnection(incomingRequest, bTerminate)
	{
		bTerminate = !!bTerminate;


		if(incomingRequest.reverseCallsClient)
		{
			for(let plugin of incomingRequest.reverseCallsClient.plugins)
			{
				if(plugin instanceof JSONRPC.Plugins.Client.WebSocketTransport)
				{
					if(bTerminate)
					{
						plugin.webSocket.terminate();
					}
					else
					{
						plugin.webSocket.close(
							/* CloseEvent.Internal Error */ 1011, 
							"[TestEndpoint.closeConnection()] Intentionally closing websocket for testing."
						);
					}
				}
			}
		}


		return null;
	}


	/**
	 * If a reverseCallsClient is available, obtain the WebSocket from it and terminate it (send FIN packet).
	 * 
	 * @param {JSONRPC.IncomingRequest} incomingRequest
	 * 
	 * @returns {null}
	 */
	async terminateConnection(incomingRequest)
	{
		return this.closeConnection(incomingRequest, /*bTerminate*/ true);
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


	/**
	 * @param {number} nPID 
	 */
	async killWorker(nPID)
	{
		if(!cluster.isMaster)
		{
			throw new Error("Only available on the master.");
		}

		for(let worker of cluster.workers)
		{
			if(worker.pid === nPID)
			{
				worker.kill();
				return;
			}
		}

		throw new Error("Worker with pid " + nPID + " not found.");
	}
};
