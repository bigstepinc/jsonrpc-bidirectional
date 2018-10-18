const assert = require("assert");

let Threads;
try
{
	Threads = require("worker_threads");
}
catch(error)
{
	//console.error(error);
}

const JSONRPC = {};
JSONRPC.Exception = require("./Exception");
JSONRPC.Server = require("./Server");
JSONRPC.IncomingRequest = require("./IncomingRequest");
JSONRPC.EndpointBase = require("./EndpointBase");
JSONRPC.RouterBase = require("./RouterBase");


JSONRPC.Plugins = {};
JSONRPC.Plugins.Client = require("./Plugins/Client");
JSONRPC.Utils = require("./Utils");


/**
 * This works only in NodeJS.
 * There is no equivalent in browsers for worker threads, other than keeping stuff centralised inside a SharedWorker (which is quite different).
 * For browsers standard worker support use BidirectionalWorkerRouter.
 * 
 * Worker threads (used by this class) are superior to cluster workers (see BidirectionalWorkerRouter) mainly because they support SharedArrayBuffer reference passing.
 * 
 * @event madeReverseCallsClient
 * The "madeReverseCallsClient" event offers automatically instantiated API clients (API clients are instantiated for each connection, lazily).
 */
module.exports =
class BidirectionalWorkerThreadRouter extends JSONRPC.RouterBase
{
	/**
	 * @override
	 * 
	 * @param {JSONRPC.Server|null} jsonrpcServer
	 */
	constructor(jsonrpcServer)
	{
		super(jsonrpcServer);

		jsonrpcServer.on(
			"response",
			(incomingRequest) => {
				incomingRequest.callResultSerialized = incomingRequest.callResultToBeSerialized;
			}
		);

		this._objWaitForWorkerReadyPromises = {};
	}


	/**
	 * Returns the connection ID.
	 * 
	 * Worker instances which will emit an error or close event will get automatically removed.
	 * 
	 * Already closed Worker instances are ignored by this function.
	 * 
	 * @param {worker_threads.Worker|Threads} threadWorker
	 * @param {string|undefined} strEndpointPath
	 * @param {number} nWorkerReadyTimeoutMilliseconds = 60000
	 * 
	 * @returns {number}
	 */
	async addWorker(threadWorker, strEndpointPath, nWorkerReadyTimeoutMilliseconds = 60000)
	{
		assert(threadWorker instanceof Threads.Worker || threadWorker === Threads);

		const nThreadID = threadWorker.threadId;

		if(!strEndpointPath)
		{
			if(!Threads.isMainThread)
			{
				throw new Error("The strEndpointPath param is mandatory inside thread workers.");
			}

			strEndpointPath = null;
		}
		else
		{
			strEndpointPath = JSONRPC.EndpointBase.normalizePath(strEndpointPath);
		}
		

		const nConnectionID = ++this._nConnectionIDCounter;

		let promiseWaitForWorkerReady;
		if(Threads.isMainThread)
		{
			this._objWaitForWorkerReadyPromises[nConnectionID] = {
				fnResolve: null, 
				fnReject: null
			};

			promiseWaitForWorkerReady = new Promise((fnResolve, fnReject) => {
				this._objWaitForWorkerReadyPromises[nConnectionID].fnResolve = fnResolve;
				this._objWaitForWorkerReadyPromises[nConnectionID].fnReject = fnReject;
			});
		}


		const objSession = {
			threadWorker: threadWorker,
			threadWorkerID: nThreadID,
			nConnectionID: nConnectionID,
			clientReverseCalls: null,
			clientThreadTransportPlugin: null,
			strEndpointPath: strEndpointPath
		};

		this._objSessions[nConnectionID] = objSession;


		const fnOnError = (error) => {
			console.error(error);

			this.onConnectionEnded(nConnectionID);

			if(Threads.isMainThread)
			{
				threadWorker.terminate();
			}
			else
			{
				process.exit(1);
			}
		};
		const fnOnClose = () => {
			this.onConnectionEnded(nConnectionID);

			if(Threads.isMainThread)
			{
				threadWorker.terminate();
			}
			else
			{
				process.exit(0);
			}
		};
		

		const fnOnMessage = async (objMessage, transferList) => {
			if(
				Threads.isMainThread
				&& typeof objMessage === "object"
				&& objMessage.jsonrpc
				&& objMessage.method === "rpc.connectToEndpoint"
			)
			{
				return this._onRPCConnectToEndpoint(objMessage, nConnectionID);
			}

			await this._routeMessage(objMessage, objSession);
		};


		const fnOnExit = (nCode) => {
			console.log(`Thread worker thread ID ${nThreadID} exited with code ${nCode}.`);

			this.onConnectionEnded(nConnectionID);

			if(Threads.isMainThread)
			{
				threadWorker.removeListener("message", fnOnMessage);
				threadWorker.removeListener("exit", fnOnExit);
				threadWorker.removeListener("error", fnOnError);
			}
			else
			{
				Threads.parentPort.removeListener("message", fnOnMessage);
				Threads.parentPort.removeListener("close", fnOnClose);
			}
		};

		if(Threads.isMainThread)
		{
			threadWorker.on("message", fnOnMessage);
			threadWorker.on("exit", fnOnExit);
			threadWorker.on("error", fnOnError);
		}
		else
		{
			Threads.parentPort.on("message", fnOnMessage);
			Threads.parentPort.on("close", fnOnClose);
		}


		if(Threads.isMainThread)
		{
			const nTimeoutWaitForWorkerReady = setTimeout(
				(event) => {
					if(this._objWaitForWorkerReadyPromises[nConnectionID])
					{
						this._objWaitForWorkerReadyPromises[nConnectionID].fnReject(new Error("Timed out waiting for thread worker to be ready for JSONRPC."));
					}
				},
				nWorkerReadyTimeoutMilliseconds
			);
			await promiseWaitForWorkerReady;
			clearTimeout(nTimeoutWaitForWorkerReady);
		}
		

		return nConnectionID;
	}


	/**
	 * @param {Object} objMessage 
	 * @param {number} nConnectionID
	 */
	_onRPCConnectToEndpoint(objMessage, nConnectionID)
	{
		const strEndpointPath = objMessage.params[0];
		assert(typeof nConnectionID === "number", "nConnectionID must be of type number.");

		if(!this._objSessions.hasOwnProperty(nConnectionID))
		{
			console.error(new Error(`[rpc.connectToEndpoint] Thread worker with connection ID ${nConnectionID} doesn't exist. Maybe it was closed.`));
			return;
		}

		try
		{
			assert(typeof strEndpointPath === "string", "strEndpointPath must be of type string.");

			this._objSessions[nConnectionID].strEndpointPath = JSONRPC.EndpointBase.normalizePath(strEndpointPath);
			this._objWaitForWorkerReadyPromises[nConnectionID].fnResolve(this._objSessions[nConnectionID].strEndpointPath);
			const threadWorker = this._objSessions[nConnectionID].threadWorker;
			
			const objResponse = {
				id: objMessage.id,
				result: null,
				jsonrpc: "2.0"
			};

			if(Threads.isMainThread)
			{
				threadWorker.postMessage(objResponse);
			}
			else
			{
				Threads.parentPort.postMessage(objResponse);
			}
		}
		catch(error)
		{
			const threadWorker = this._objSessions[nConnectionID].threadWorker;

			const objResponse = {
				id: objMessage.id,
				error: {
					message: error.message + "\n" + error.stack, 
					code: 0
				},
				jsonrpc: "2.0"
			};
			
			if(Threads.isMainThread)
			{
				threadWorker.postMessage(objResponse);
			}
			else
			{
				Threads.parentPort.postMessage(objResponse);
			}
			

			this._objWaitForWorkerReadyPromises[nConnectionID].fnReject(error);
		}
	}


	/**
	 * Overridable to allow configuring the client further.
	 * 
	 * @param {Class} ClientClass
	 * @param {Object} objSession
	 * 
	 * @returns {JSONRPC.Client}
	 */
	_makeReverseCallsClient(ClientClass, objSession)
	{
		const clientReverseCalls = new ClientClass(objSession.strEndpointPath);
		
		objSession.clientThreadTransportPlugin = new JSONRPC.Plugins.Client.WorkerThreadTransport(objSession.threadWorker, /*bBidirectionalWorkerMode*/ true);
		clientReverseCalls.addPlugin(objSession.clientThreadTransportPlugin);

		this.emit("madeReverseCallsClient", clientReverseCalls);

		return clientReverseCalls;
	}


	/**
	 * Routes worker messages to either the client or the server worker plugin.
	 * 
	 * @param {Object} objMessage
	 * @param {Object} objSession
	 */
	async _routeMessage(objMessage, objSession)
	{
		const threadWorker = objSession.threadWorker;
		const nThreadID = objSession.threadID;
		const nConnectionID = objSession.nConnectionID;

		if(typeof objMessage !== "object")
		{
			console.error(`BidirectionalWorkerThreadRouter [thread ID ${nThreadID}]: Received ${typeof objMessage} instead of object. Ignoring. RAW message: ${JSON.stringify(objMessage)}`);
			return;
		}

		let bNotification = !objMessage.hasOwnProperty("id");

		try
		{
			if(objMessage.hasOwnProperty("method"))
			{
				if(!this._jsonrpcServer)
				{
					throw new Error("JSONRPC.Server not initialized on this Worker.");
				}


				const incomingRequest = new JSONRPC.IncomingRequest();

				incomingRequest.connectionID = nConnectionID;
				incomingRequest.router = this;

				incomingRequest.stackInErrorMessage = true;
				
				try
				{
					const strEndpointPath = this._objSessions[nConnectionID].strEndpointPath;
					
					if(!this._jsonrpcServer.endpoints.hasOwnProperty(strEndpointPath))
					{
						throw new JSONRPC.Exception("Unknown JSONRPC endpoint " + strEndpointPath + ".", JSONRPC.Exception.METHOD_NOT_FOUND);
					}

					incomingRequest.endpoint = this._jsonrpcServer.endpoints[strEndpointPath];

					incomingRequest.requestBody = objMessage;
					incomingRequest.requestObject = objMessage;
				}
				catch(error)
				{
					incomingRequest.callResult = error;
				}


				await this._jsonrpcServer.processRequest(incomingRequest);


				if(!bNotification)
				{
					if(Threads.isMainThread)
					{
						threadWorker.postMessage(incomingRequest.callResultSerialized);
					}
					else
					{
						Threads.parentPort.postMessage(incomingRequest.callResultSerialized);
					}
				}
			}
			else if(objMessage.hasOwnProperty("result") || objMessage.hasOwnProperty("error"))
			{
				if(
					this._objSessions.hasOwnProperty(nConnectionID)
					&& this._objSessions[nConnectionID].clientThreadTransportPlugin === null
				)
				{
					if(Threads.isMainThread)
					{
						threadWorker.terminate();
					}
					else
					{
						process.exit(objMessage.hasOwnProperty("error") ? 1 : 0);
					}

					throw new Error("How can the client be not initialized, and yet getting responses from phantom requests?");
				}
				
				if(this._objSessions.hasOwnProperty(nConnectionID))
				{
					await this._objSessions[nConnectionID].clientThreadTransportPlugin.processResponse(objMessage);
				}
				else
				{
					console.error("Connection ID " + nConnectionID + " is closed and session is missing. Ignoring response: " + JSON.stringify(objMessage));
				}
			}
			else
			{
				// Malformed message, will attempt to send a response.
				bNotification = false;

				throw new Error("Unable to qualify the message as a JSONRPC request or response.");
			}
		}
		catch(error)
		{
			console.error(error);
			console.error("Uncaught error. RAW remote message: " + JSON.stringify(objMessage));

			console.log(`Unclean state. Closing thread worker ${nThreadID}.`);
			
			this.onConnectionEnded(nConnectionID);
			if(Threads.isMainThread)
			{
				threadWorker.terminate();
			}
			else
			{
				process.exit(1);
			}
		}
	}


	/**
	 * @param {number} nConnectionID 
	 */
	onConnectionEnded(nConnectionID)
	{
		super.onConnectionEnded(nConnectionID);

		delete this._objWaitForWorkerReadyPromises[nConnectionID];
	}
};
