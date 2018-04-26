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
};

module.exports = MasterEndpoint;
