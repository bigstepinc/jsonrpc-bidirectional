const sleep = require("sleep-promise");

const cluster = require("cluster");

const JSONRPC = require("../../index");

const TestClient = require("./TestClient");

const assert = require("assert");

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


		/*******************************************************
		 * WebRTC stuff:
		 *******************************************************/
		this._arrLonelyHeartWebRTCClients = [];
		this._objHookedUpRTCPairs = {};
		this._nWebRTCConnectionID = 0;

		this._nWebRTCCupidonHeartBeat = setInterval(
			async () => {
				while(this._arrLonelyHeartWebRTCClients.length >= 2)
				{
					const objMale = this._arrLonelyHeartWebRTCClients.pop();
					const objFemale = this._arrLonelyHeartWebRTCClients.pop();
					const nRTCConnectionID = ++this._nWebRTCConnectionID;

					const arrIceServers = [
						/*{
							urls: "turn:192.168.137.3:3478",
							username: "guest",
							credential: "thirdeye"
						}*/
					];

					try
					{
						this._objHookedUpRTCPairs[nRTCConnectionID] = {
							objMale: objMale,
							objFemale: objFemale
						};


						const objOffer = await objMale.client.rpc("makeOffer", [nRTCConnectionID, arrIceServers]);
						assert(objOffer.type === "offer", "Not an offer.");
						
						const objAnswer = await objFemale.client.rpc("makeAnswer", [nRTCConnectionID, objOffer, arrIceServers]);
						assert(objAnswer.type === "answer", "Not an answer.");


						await objMale.client.rpc("thatsWhatSheSaid", [nRTCConnectionID, objAnswer]);

						objMale.client.plugins[0].webSocket.on(
							"close",
							async (nCode, strReason) => {
								if(objFemale.client.plugins[0].webSocket.readyState === JSONRPC.WebSocketAdapters.WebSocketWrapperBase.OPEN)
								{
									delete this._objHookedUpRTCPairs[nRTCConnectionID];
									await objFemale.client.rpc("breakUpRTCConnection", [nRTCConnectionID]);
								}
							}
						);
						objFemale.client.plugins[0].webSocket.on(
							"close",
							async (nCode, strReason) => {
								if(objMale.client.plugins[0].webSocket.readyState === JSONRPC.WebSocketAdapters.WebSocketWrapperBase.OPEN)
								{
									delete this._objHookedUpRTCPairs[nRTCConnectionID];
									await objMale.client.rpc("breakUpRTCConnection", [nRTCConnectionID]);
								}
							}
						);
					}
					catch(error)
					{
						objMale.fnReject(error);
						objFemale.fnReject(error);

						delete this._objHookedUpRTCPairs[nRTCConnectionID];
					}
				}
			},
			1000
		);
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
	 */
	async _protectedMethod(incomingRequest)
	{
		console.error("Security error. A call passed through to _protectedMethod().");
		process.exit(1);
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
						if(plugin.webSocket.readyState === JSONRPC.WebSocketAdapters.WebSocketWrapperBase.OPEN)
						{
							plugin.webSocket.close(
								/* CloseEvent.Internal Error */ 1011, 
								"[TestEndpoint.closeConnection()] Intentionally closing websocket for testing."
							);
						}
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
	 * Function returning a simple object containing a timestamp.
	 * 
	 * @param {mixed} value
	 * @returns {{dummyProperty: 5, dateObject: {timestamp: {UnixTimestamp}}}}
	 */
	async getCurrentDateTimestamp(value)
	{
		await sleep(100);

		return {
			dummyProperty: 5,
			dateObject: {
				timestamp: Date.now()
			}
		};
	}


	/**
	 * Function returning a simple object containing a timestamp.
	 * 
	 * @param {mixed} value
	 * @returns {{dummyProperty: 5, dateObject: {timestamp: {UnixTimestamp}}}}
	 */
	async getCurrentDateTimestampToBeCached(value)
	{
		await sleep(100);
		
		return {
			dummyProperty: 5,
			dateObject: {
				timestamp: Date.now()
			}
		};
	}


	/**
	 * @param {JSONRPC.IncomingRequest} incomingRequest
	 * @param {number} nPID 
	 */
	async killWorker(incomingRequest, nPID)
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


	/**
	 * Register a lonely client.
	 * 
	 * @param {JSONRPC.IncomingRequest} incomingRequest
	 * @returns {null}
	 */
	async cupidonTheWebRTCConnection(incomingRequest)
	{
		return new Promise((fnResolve, fnReject) => {
			const objCupidonPending = {
				client: incomingRequest.reverseCallsClient,
				fnResolve: fnResolve,
				fnReject: fnReject,
				nWebSocketConnectionID: incomingRequest.connectionID
			};

			this._arrLonelyHeartWebRTCClients.push(objCupidonPending);
		});
	}


	/**
	 * @param {JSONRPC.IncomingRequest} incomingRequest
	 * @param {number} nRTCConnectionID
	 * @param {Object} objRTCIceCandidate
	 * 
	 * @returns {null}
	 */
	async webRTCAddIceCandidate(incomingRequest, nRTCConnectionID, objRTCIceCandidate)
	{
		if(!this._objHookedUpRTCPairs[nRTCConnectionID])
		{
			throw new Error("Could not find connection ID " + JSON.stringify(nRTCConnectionID));
		}

		try
		{
			if(incomingRequest.connectionID === this._objHookedUpRTCPairs[nRTCConnectionID].objMale.nWebSocketConnectionID)
			{
				await this._objHookedUpRTCPairs[nRTCConnectionID].objFemale.client.rpc("webRTCAddIceCandidate", [nRTCConnectionID, objRTCIceCandidate]);
			}
			else if(incomingRequest.connectionID === this._objHookedUpRTCPairs[nRTCConnectionID].objFemale.nWebSocketConnectionID)
			{
				await this._objHookedUpRTCPairs[nRTCConnectionID].objMale.client.rpc("webRTCAddIceCandidate", [nRTCConnectionID, objRTCIceCandidate]);
			}
			else
			{
				throw new JSONRPC.Exception("You are not authorized to access connection ID " + nRTCConnectionID, JSONRPC.Exception.NOT_AUTHORIZED);
			}
		}
		catch(error)
		{
			this._objHookedUpRTCPairs[nRTCConnectionID].objMale.fnReject(error);
			this._objHookedUpRTCPairs[nRTCConnectionID].objFemale.fnReject(error);

			throw error;
		}
	}


	/**
	 * @param {JSONRPC.IncomingRequest} incomingRequest
	 * @param {number} nRTCConnectionID
	 * 
	 * @returns {null}
	 */
	async femaleDataChannelIsOpen(incomingRequest, nRTCConnectionID)
	{
		if(incomingRequest.connectionID === this._objHookedUpRTCPairs[nRTCConnectionID].objFemale.nWebSocketConnectionID)
		{
			try
			{
				await this._objHookedUpRTCPairs[nRTCConnectionID].objMale.client.rpc("femaleDataChannelIsOpen", [nRTCConnectionID]);
			}
			catch(error)
			{
				this._objHookedUpRTCPairs[nRTCConnectionID].objMale.fnReject(error);
				this._objHookedUpRTCPairs[nRTCConnectionID].objFemale.fnReject(error);

				throw error;
			}

			this._objHookedUpRTCPairs[nRTCConnectionID].objMale.fnResolve(nRTCConnectionID);
			this._objHookedUpRTCPairs[nRTCConnectionID].objFemale.fnResolve(nRTCConnectionID);
		}
		else
		{
			const error = new Error("Unknown connection ID, or you are not authorized to signal the channel is open.");

			this._objHookedUpRTCPairs[nRTCConnectionID].objMale.fnReject(error);
			this._objHookedUpRTCPairs[nRTCConnectionID].objFemale.fnReject(error);

			throw error;
		}
	}


	/**
	 * 
	 * @param {JSONRPC.IncomingRequest} incomingRequest 
	 * @param {string} strRedirectURL 
	 */
	async processAndRedirect(incomingRequest, strRedirectURL)
	{
		incomingRequest.setRedirectURL(strRedirectURL);
	}
};
