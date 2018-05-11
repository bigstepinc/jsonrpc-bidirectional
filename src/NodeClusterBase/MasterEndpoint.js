const cluster = require("cluster");
const os = require("os");
const assert = require("assert");
const fs = require("fs-promise");

const sleep = require("sleep-promise");
const JSONRPC = {
	EndpointBase: require("../EndpointBase"),
	Server: require("../Server"),
	Client: require("../Client"),
	BidirectionalWorkerRouter: require("../BidirectionalWorkerRouter"),
	Plugins: {
		Server: require("../Plugins/Server"),
		Client: require("../Plugins/Client")
	}
};


/**
 * Extend this class to export extra master RPC APIs.
 * 
 * Counter-intuitively, this endpoint instantiates its own JSONRPC.Server and JSONRPC.BidirectionalWorkerRouter,
 * inside .start().
 * 
 * The "workerReady" event is issued when a new worker is ready to receive RPC calls. The event is called with the JSORNPC client as first param.
 * 
 * @event workerReady
 */
class MasterEndpoint extends JSONRPC.EndpointBase
{
	constructor(classReverseCallsClient)
	{
		console.log(`Fired up ${cluster.isWorker ? "worker" : "master"} with PID ${process.pid}`);

		super(
			/*strName*/ "ClusterIPC", 
			/*strPath*/ "/api-cluster/IPC", 
			/*objReflection*/ {}, 
			classReverseCallsClient
		);

		if(!cluster.isMaster)
		{
			throw new Error("MasterEndpoint can only be instantiated in the master process.");
		}

		this._bidirectionalWorkerRouter = null;
		this._jsonrpcServer = null;

		this.bShuttingDown = false;
		this.arrFailureTimestamps = [];

		this.objWorkerIDToState = {};

		this._bWorkersStarted = false;
		this._bWatchingForUpgrade = false;

		this._nMaxWorkersCount = Number.MAX_SAFE_INTEGER;


		this._objRPCToWorkersRoundRobinStates = {};
		
		// Used if the call is proxied from another worker (which is then round robined to the executor worker), 
		// and the result is allowed to be from a recently cached value.
		this._objWorkerToMethodNameLastFreshness = {};
	}


	/**
	 * The object has worker IDs as keys and object values like this: {client: JSONRPC.Client, ready: boolean}.
	 * 
	 * @returns {Object<workerID:number, {client:JSONRPC.Client, ready:boolean}>}
	 */
	get workerClients()
	{
		return this.objWorkerIDToState;
	}


	/**
	 * @param {number} nWorkersCount
	 */
	set maxWorkersCount(nWorkersCount)
	{
		assert(typeof nWorkersCount === "number", `Invalid property type for nWorkersCount in MasterEndpoint. Expected "number", but got ${typeof nWorkersCount}.`);

		this._nMaxWorkersCount = nWorkersCount;
	}


	/**
	 * @returns {number}
	 */
	get maxWorkersCount()
	{
		return this._nMaxWorkersCount;
	}


	/**
	 * This overridable function is called and awaited inside startWorker().
	 * 
	 * This mustn't be called through JSONRPC.
	 * 
	 * @param {undefined} incomingRequest
	 */
	async _startServices(incomingRequest)
	{
		if(incomingRequest)
		{
			throw new Error("This mustn't be called through JSONRPC.");
		}

		// this.workerClients is empty at this stage.
	}


	/**
	 * This overridable function is called and awaited inside gracefulExit().
	 * Careful, gracefulExit() will timeout waiting after services to stop after a while.
	 * 
	 * This mustn't be called through JSONRPC.
	 * 
	 * @param {undefined} incomingRequest
	 */
	async _stopServices(incomingRequest)
	{
		if(incomingRequest)
		{
			throw new Error("This mustn't be called through JSONRPC.");
		}
	}


	/**
	 * Starts the JSONRPC server over cluster IPC, and forks worker processes.
	 */
	async start()
	{
		if(this._bWorkersStarted)
		{
			throw new Error("Workers have already been started.");
		}
		this._bWorkersStarted = true;

		this._jsonrpcServer = new JSONRPC.Server();

		// By default, JSONRPC.Server rejects all requests as not authenticated and not authorized.
		this._jsonrpcServer.addPlugin(new JSONRPC.Plugins.Server.AuthenticationSkip());
		this._jsonrpcServer.addPlugin(new JSONRPC.Plugins.Server.AuthorizeAll());
		this._jsonrpcServer.registerEndpoint(this);

		this._bidirectionalWorkerRouter = new JSONRPC.BidirectionalWorkerRouter(this._jsonrpcServer);

		cluster.on(
			"fork",
			async (worker) => {
				try
				{
					this.objWorkerIDToState[worker.id] = {
						client: null,
						ready: false
					};

					console.log("Adding worker ID " + worker.id + " to BidirectionalWorkerRouter.");
					const nConnectionID = await this._bidirectionalWorkerRouter.addWorker(worker, /*strEndpointPath*/ this.path, 120 * 1000 /*Readiness timeout in milliseconds*/);

					this.objWorkerIDToState[worker.id].client = this._bidirectionalWorkerRouter.connectionIDToSingletonClient(nConnectionID, this.ReverseCallsClientClass);

					this.emit("workerReady", this.objWorkerIDToState[worker.id].client);
				}
				catch(error)
				{
					console.error(error);
					console.error("Cluster master process, on fork event handler unexpected error. Don't know how to handle.");
					process.exit(1);
				}
			}
		);

		cluster.on(
			"exit", 
			async (worker, nExitCode, nKillSignal) => {
				try
				{
					console.log(`Worker with PID  ${worker.process.pid} died. Exit code: ${nExitCode}. Signal: ${nKillSignal}.`);
					
					this.arrFailureTimestamps.push(new Date().getTime());
					this.arrFailureTimestamps = this.arrFailureTimestamps.filter((nMillisecondsUnixTime) => {
						return nMillisecondsUnixTime >= new Date().getTime() - (60 * 2 * 1000);
					});
			
					if(this.arrFailureTimestamps.length / Math.max(os.cpus().length, 1) > 4)
					{
						await this.gracefulExit(null);
					}
					else
					{
						if(!this.bShuttingDown)
						{
							await sleep(500);
							cluster.fork();
						}
					}
				}
				catch(error)
				{
					console.error(error);
					console.error("Cluster master process, on worker exit event handler unexpected error. Don't know how to handle. Exiting...");
					process.exit(1);
				}
			}
		);

		await this._startServices();

		for (let i = 0; i < Math.min(Math.max(os.cpus().length, 1), this.maxWorkersCount); i++)
		{
			cluster.fork();
		}
	}


	/**
	 * If the version in package.json changes, this.gracefulExit() will be invoked.
	 * 
	 * @param {string} strPackageJSONPath
	 * 
	 * @returns {undefined}
	 */
	async watchForUpgrade(strPackageJSONPath)
	{
		assert(typeof strPackageJSONPath === "string");

		if(this._bWatchingForUpgrade)
		{
			return;
		}

		this._bWatchingForUpgrade = true;

		const strVersion = JSON.parse(await fs.readFile(strPackageJSONPath, "utf8")).version;
		let nPackageJSONModificationTime = (await fs.stat(strPackageJSONPath)).mtime.getTime();
		let strVersionNew = strVersion;

		const nIntervalMilliseconds = 10 * 1000;

		const nIntervalID = setInterval(
			async () => {
				try
				{
					if(nPackageJSONModificationTime !== (await fs.stat(strPackageJSONPath)).mtime.getTime())
					{
						nPackageJSONModificationTime = (await fs.stat(strPackageJSONPath)).mtime.getTime();
						strVersionNew = JSON.parse(await fs.readFile(strPackageJSONPath, "utf8")).version;
					}

					if(strVersionNew !== strVersion)
					{
						clearInterval(nIntervalID);

						console.log(`
							Updated. 
							Detected new version ${strVersionNew}. 
							Old version ${strVersion}. 
							Attempting to exit gracefully to allow starting with new version.
						`.replace(/^\t+/gm, ""));

						await this.gracefulExit(null);
					}
				}
				catch(error)
				{
					console.error(error);
				}
			},
			nIntervalMilliseconds
		);
	}


	/**
	 * Override this method to start calling into workers as soon as the first one is ready.
	 * 
	 * Signals a worker's JSONRPC endpoint is ready to receive calls.
	 * 
	 * @param {JSONRPC.IncomingRequest} incomingRequest
	 * @param {number} nWorkerID
	 */
	async workerServicesReady(incomingRequest, nWorkerID)
	{
		this.objWorkerIDToState[nWorkerID].ready = true;
	}


	/**
	 * Helps distribute calls to workers to even out workload, 
	 * and optionally reuse identical function calls' results based on a freshness counter when acting as a proxy between workers.
	 * 
	 * If bFreshlyCachedWorkerProxyMode is true, the call must come from another worker. 
	 * It is guaranteed that the calling worker will always get a new promise, 
	 * that is the same promise from the cache will never be returned more than once to the same calling worker.
	 * 
	 * bFreshlyCachedWorkerProxyMode does not allow any params, the arrParams array must be empty.
	 * 
	 * bFreshlyCachedWorkerProxyMode *is not* and *does not resemble* a time based expiration cache. 
	 * If you need a time based expiration cache, add JSONRPC.Plugins.Client.Cache to your client to your JSONRPC.Client subclass client (if you have one), 
	 * or use any other similar caching mechanism however you need it implemented.
	 * 
	 * @param {JSONRPC.IncomingRequest|null} incomingRequest
	 * @param {string} strMethodName 
	 * @param {Array} arrParams
	 * @param {boolean} bFreshlyCachedWorkerProxyMode = false
	 * 
	 * @returns {Promise<any>}
	 */
	async rpcToRoundRobinWorker(incomingRequest, strMethodName, arrParams, bFreshlyCachedWorkerProxyMode = false)
	{
		// Warning to future developers: from this point up until saving the promise from the actual .rpc call, 
		// the code must be 100% synchronous (no awaits).

		let nMinimumRequestedFreshness = 0;

		if(bFreshlyCachedWorkerProxyMode)
		{
			// assert(incomingRequest.reverseCallsClient instanceof JSONRPC.Plugins.Client.WorkerTransport);
			if(
				!incomingRequest
				|| !incomingRequest.reverseCallsClient
			)
			{
				throw new Error("bFreshlyCachedWorkerProxyMode needs incomingRequest.reverseCallsClient to be initialized (bidirectional JSONRPC");
			}

			const workerTransportPlugin = incomingRequest.reverseCallsClient.plugins.filter(plugin => plugin.worker && plugin.worker.id && plugin.worker.on)[0];

			if(!workerTransportPlugin)
			{
				throw new Error("bFreshlyCachedWorkerProxyMode needs to know the cluster worker ID of the calling worker from incomingRequest.reverseCallsClient.plugins[?].worker.id (and it must be of type number.");
			}

			const nWorkerID = workerTransportPlugin.worker.id;

			if(arrParams.length)
			{
				throw new Error("bFreshlyCachedWorkerProxyMode does not allow any params, the arrParams array must be empty.");
			}

			if(!this._objWorkerToMethodNameLastFreshness[nWorkerID])
			{
				this._objWorkerToMethodNameLastFreshness[nWorkerID] = {};

				workerTransportPlugin.worker.on(
					"exit",
					(nCode, nSignal) => {
						delete this._objWorkerToMethodNameLastFreshness[nWorkerID];
					}
				);
			}

			if(!this._objWorkerToMethodNameLastFreshness[nWorkerID][strMethodName])
			{
				this._objWorkerToMethodNameLastFreshness[nWorkerID][strMethodName] = 0;
			}

			nMinimumRequestedFreshness = ++this._objWorkerToMethodNameLastFreshness[nWorkerID][strMethodName];
		}

		if(!this._objRPCToWorkersRoundRobinStates[strMethodName])
		{
			this._objRPCToWorkersRoundRobinStates[strMethodName] = {
				counter: 0, 
				promiseRPCResult: null
			};
		}

		const objRoundRobinState = this._objRPCToWorkersRoundRobinStates[strMethodName];

		let nCounter = objRoundRobinState.counter;

		const arrWorkerStates = Object.values(this.objWorkerIDToState);
		
		if(bFreshlyCachedWorkerProxyMode && nMinimumRequestedFreshness <= nCounter && objRoundRobinState.promiseRPCResult)
		{
			return objRoundRobinState.promiseRPCResult;
		}

		objRoundRobinState.promiseRPCResult = null;
		nCounter = ++objRoundRobinState.counter;

		if(arrWorkerStates.length)
		{
			let i, objWorkerState;

			for(i = nCounter % arrWorkerStates.length; !objWorkerState && i < arrWorkerStates.length; i++)
			{
				if(arrWorkerStates[i].ready)
				{
					objWorkerState = arrWorkerStates[i];
				}
			}

			for(i = 0; !objWorkerState && i < nCounter % arrWorkerStates.length; i++)
			{
				if(arrWorkerStates[i].ready)
				{
					objWorkerState = arrWorkerStates[i];
				}
			}

			if(objWorkerState)
			{
				if(bFreshlyCachedWorkerProxyMode)
				{
					objRoundRobinState.promiseRPCResult = /*await*/ objWorkerState.client.rpc(strMethodName, arrParams);
					return objRoundRobinState.promiseRPCResult;
				}
				else
				{
					return await objWorkerState.client.rpc(strMethodName, arrParams);
				}
			}
		}

		throw new JSONRPC.Exception("No ready for RPC cluster workers were found.", JSONRPC.Exception.INTERNAL_ERROR);
	}


	/**
	 * @param {JSONRPC.IncomingRequest|null} incomingRequest
	 * 
	 * @returns {undefined}
	 */
	async gracefulExit(incomingRequest)
	{
		if(this.bShuttingDown)
		{
			return;
		}

		this.bShuttingDown = true;

		
		for(const nWorkerID in cluster.workers)
		{
			if(
				cluster.workers[nWorkerID].isConnected()
				&& this.objWorkerIDToState[nWorkerID].ready
			)
			{
				// Do not await, need these in parallel.
				/*await*/ this.objWorkerIDToState[nWorkerID].client.gracefulExit()
				.then(() => { /*gracefulExit should never return.*/ })
				.catch((error) => {
					if(cluster.workers.hasOwnProperty(nWorkerID) && !cluster.workers[nWorkerID].isDead())
					{
						console.error(error);
						cluster.workers[nWorkerID].kill();
					}
				});
			}
			else if(!cluster.workers[nWorkerID].isDead())
			{
				cluster.workers[nWorkerID].kill();
			}
		}
		

		console.log("Waiting for workers to exit gracefully.");
		let bKeepWaiting = true;
		while(bKeepWaiting)
		{
			bKeepWaiting = false;

			for(const nWorkerID in cluster.workers)
			{
				if(!cluster.workers[nWorkerID].isDead())
				{
					bKeepWaiting = true;
				}
			}

			if(bKeepWaiting)
			{
				await sleep(1000);
			}
		}
		console.log("All workers have exited.");

		await this._stopServices();

		console.log("[" + process.pid + "] Master process exiting gracefully.");
		process.exit(0);
	}


	/**
	 * @param {JSONRPC.IncomingRequest|null} incomingRequest
	 * @param {string} strReturn
	 * 
	 * @returns {string}
	 */
	async ping(incomingRequest, strReturn)
	{
		console.log("Worker said: " + JSON.stringify(strReturn));
		return strReturn;
	}


	/**
	 * @param {JSONRPC.IncomingRequest} incomingRequest
	 * @param {number} nWorkerID
	 * @param {string} strFunctionName
	 * @param {Array} arrParams
	 * @param {boolean} bNotification = false
	 * 
	 * @returns {*}
	 */
	async rpcWorker(incomingRequest, nWorkerID, strFunctionName, arrParams, bNotification = false)
	{
		if(!this.workerClients[nWorkerID])
		{
			throw new JSONRPC.Exception(`Cluster worker.id ${nWorkerID} is not alive.`);
		}

		if(!this.workerClients[nWorkerID].ready)
		{
			throw new JSONRPC.Exception(`Cluster worker.id ${nWorkerID} RPC client has not signaled it is ready for cluster IPC RPC, yet.`);
		}

		return await this.workerClients[nWorkerID].client.rpc(strFunctionName, arrParams, bNotification);
	}
};

module.exports = MasterEndpoint;
