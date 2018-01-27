const assert = require("assert");

let cluster = require("cluster");
if(!cluster)
{
	cluster = {
		isMaster: !(self && self.document === undefined),
		isWorker: !!(self && self.document === undefined)
	};
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
 * @event madeReverseCallsClient
 * The "madeReverseCallsClient" event offers automatically instantiated API clients (API clients are instantiated for each connection, lazily).
 * 
 * In a browser environment, when a worker is killed or has ended execution,
 * onConnectionEnded(nConnectionID) must be called "manually" from outside this class.
 */
module.exports =
class BidirectionalWorkerRouter extends JSONRPC.RouterBase
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
	 * @param {Worker} worker
	 * @param {string|undefined} strEndpointPath
	 * @param {number} nWorkerReadyTimeoutMilliseconds = 60000
	 * 
	 * @returns {number}
	 */
	async addWorker(worker, strEndpointPath, nWorkerReadyTimeoutMilliseconds = 60000)
	{
		if(!strEndpointPath)
		{
			if(cluster.isWorker)
			{
				throw new Error("The strEndpointPath param is mandatory inside workers.");
			}

			strEndpointPath = null;
		}
		else
		{
			strEndpointPath = JSONRPC.EndpointBase.normalizePath(strEndpointPath);
		}

		assert(cluster.isMaster || process === worker || self === worker, "Unknown worker type.");


		const nConnectionID = ++this._nConnectionIDCounter;

		let promiseWaitForWorkerReady;
		if(cluster.isMaster)
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
			worker: worker,
			nConnectionID: nConnectionID,
			clientReverseCalls: null,
			clientWorkerTransportPlugin: null,
			strEndpointPath: strEndpointPath
		};

		this._objSessions[nConnectionID] = objSession;


		const fnOnError = (/*error*/) => {
			// console.error(error);

			this.onConnectionEnded(nConnectionID);

			if(worker.terminate)
			{
				worker.terminate();
			}
			else if(worker !== process && !worker.isDead())
			{
				worker.kill();
			}
		};
		

		if(worker.addEventListener)
		{
			worker.addEventListener(
				"message", 
				async (messageEvent) => {
					if(
						cluster.isMaster
						&& typeof messageEvent.data === "object"
						&& messageEvent.data.jsonrpc
						&& messageEvent.data.method === "rpc.connectToEndpoint"
					)
					{
						return this._onRPCConnectToEndpoint(messageEvent.data, nConnectionID);
					}

					await this._routeMessage(messageEvent.data, objSession);
				}
			);

			// No event for a terminated worker.
			// this.onConnectionEnded(nConnectionID) must be called from outside this class.

			worker.addEventListener("error", fnOnError);
		}
		else
		{
			worker.on(
				"message", 
				async (objMessage, handle) => {
					if(
						cluster.isMaster
						&& typeof objMessage === "object"
						&& objMessage.jsonrpc
						&& objMessage.method === "rpc.connectToEndpoint"
					)
					{
						return this._onRPCConnectToEndpoint(objMessage, nConnectionID);
					}

					await this._routeMessage(objMessage, objSession);
				}
			);

			worker.on(
				"exit",
				(nCode, nSignal) => {
					this.onConnectionEnded(nConnectionID);
				}
			);

			worker.on("error", fnOnError);
		}


		if(cluster.isMaster)
		{
			const nTimeoutWaitForWorkerReady = setTimeout(
				(event) => {
					this._objWaitForWorkerReadyPromises[nConnectionID].fnReject(new Error("Timed out waiting for worker to be ready for JSONRPC."));
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

		try
		{
			assert(typeof strEndpointPath === "string", "strEndpointPath must be of type string.");

			this._objSessions[nConnectionID].strEndpointPath = JSONRPC.EndpointBase.normalizePath(strEndpointPath);
			this._objWaitForWorkerReadyPromises[nConnectionID].fnResolve(this._objSessions[nConnectionID].strEndpointPath);
			const worker = this._objSessions[nConnectionID].worker;
			
			const objResponse = {
				id: objMessage.id,
				result: null,
				jsonrpc: "2.0"
			};

			if(worker.postMessage)
			{
				worker.postMessage(objResponse);
			}
			else
			{
				worker.send(objResponse);
			}
		}
		catch(error)
		{
			const worker = this._objSessions[nConnectionID].worker;

			const objResponse = {
				id: objMessage.id,
				error: {
					message: error.message + "\n" + error.stack, 
					code: 0
				},
				jsonrpc: "2.0"
			};
			if(worker.postMessage)
			{
				worker.postMessage(objResponse);
			}
			else
			{
				worker.send(objResponse);
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
		
		objSession.clientWorkerTransportPlugin = new JSONRPC.Plugins.Client.WorkerTransport(objSession.worker, /*bBidirectionalWorkerMode*/ true);
		clientReverseCalls.addPlugin(objSession.clientWorkerTransportPlugin);

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
		const worker = objSession.worker;
		const nConnectionID = objSession.nConnectionID;

		if(typeof objMessage !== "object")
		{
			console.error("[" + process.pid + "] WorkerBidirectionalRouter: Received " + (typeof objMessage) + " instead of object. Ignoring. RAW message: " + JSON.stringify(objMessage));
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
					if(worker.postMessage)
					{
						worker.postMessage(incomingRequest.callResultSerialized);
					}
					else
					{
						worker.send(incomingRequest.callResultSerialized);
					}
				}
			}
			else if(objMessage.hasOwnProperty("result") || objMessage.hasOwnProperty("error"))
			{
				if(
					this._objSessions.hasOwnProperty(nConnectionID)
					&& this._objSessions[nConnectionID].clientWorkerTransportPlugin === null
				)
				{
					if(worker.terminate)
					{
						worker.terminate();
					}
					else if(worker !== process)
					{
						worker.kill();
					}

					throw new Error("How can the client be not initialized, and yet getting responses from phantom requests?");
				}
				
				if(this._objSessions.hasOwnProperty(nConnectionID))
				{
					await this._objSessions[nConnectionID].clientWorkerTransportPlugin.processResponse(objMessage);
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

			console.log("[" + process.pid + "] Unclean state. Closing worker.");
			
			this.onConnectionEnded(nConnectionID);
			if(worker.terminate)
			{
				worker.terminate();
			}
			else if(worker !== process)
			{
				worker.kill();
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
