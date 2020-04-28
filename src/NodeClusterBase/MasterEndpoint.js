const cluster = require("cluster");
const os = require("os");
const assert = require("assert");

const sleep = require("sleep-promise");

const NodeMultiCoreCPUBase = require("../NodeMultiCoreCPUBase");

const JSONRPC = {
	BidirectionalWorkerRouter: require("../BidirectionalWorkerRouter")
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
class MasterEndpoint extends NodeMultiCoreCPUBase.MasterEndpoint
{
	constructor(classReverseCallsClient = null)
	{
		if(classReverseCallsClient === null)
		{
			classReverseCallsClient = require("./WorkerClient");
		}

		console.log(`Fired up cluster ${cluster.isWorker ? "worker" : "master"} with PID ${process.pid}`);

		if(!cluster.isMaster)
		{
			throw new Error("MasterEndpoint can only be instantiated in the master process.");
		}

		super(classReverseCallsClient);
	}


	async _configureBeforeStart()
	{
		cluster.on(
			"fork",
			async(worker) => {
				try
				{
					let nPersistentWorkerID;
					for(let nPersistentWorkerIDIterator in this.objPersistentWorkerIDToWorkerID)
					{
						if(this.objPersistentWorkerIDToWorkerID[nPersistentWorkerIDIterator] === worker.id)
						{
							nPersistentWorkerID = Number(nPersistentWorkerIDIterator);
							break;
						}
					}

					assert(nPersistentWorkerID !== undefined, `Something went wrong, as worker with PID ${worker.id} wasn't assigned a persistentID before fork.`);

					this.objWorkerIDToState[worker.id] = {
						client: null,
						ready: false,
						exited: false,
						persistentID: nPersistentWorkerID
					};

					console.log("Adding worker ID " + worker.id + " and persistent ID " + nPersistentWorkerID + " to BidirectionalWorkerRouter.");
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
			async(worker, nExitCode, nKillSignal) => {
				try
				{
					let nPersistentWorkerID;
					if(this.objWorkerIDToState[worker.id] !== undefined)
					{
						this.objWorkerIDToState[worker.id].exited = true;
						nPersistentWorkerID = this.objWorkerIDToState[worker.id].persistentID;
					}

					console.log(`Worker with PID  ${worker.process.pid} and persistentId ${nPersistentWorkerID} died. Exit code: ${nExitCode}. Signal: ${nKillSignal}.`);
					
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
							// cluster.fork();
							this._addWorker(nPersistentWorkerID);
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
	}


	async _addWorker(nPersistentWorkerID = null)
	{
		// First assign persistentId using objPersistentWorkerIDToWorkerID, which will be added to
		// objWorkerIDToState in 'fork' event handler defined in _configureBeforeStart.
		assert(nPersistentWorkerID === null || typeof nPersistentWorkerID === "number", `Invalid property type for nPersistentWorkerID in MasterEndpoint. Expected "number", but got ${typeof nPersistentWorkerID}.`);

		if(nPersistentWorkerID !== null)
		{
			const nExistingWorkerID = this.objPersistentWorkerIDToWorkerID[nPersistentWorkerID];
			if(nExistingWorkerID !== undefined && nExistingWorkerID !== null)
			{
				if(this.objWorkerIDToState[nExistingWorkerID].exited !== true)
				{
					console.log(`Worker with PID ${nExistingWorkerID} that hasn't exited yet already has persistentId ${nPersistentWorkerID}.`);
					return;
				}
			}
		}
		else
		{
			nPersistentWorkerID = this._nNextAvailablePersistentWorkerID++;
		}

		const workerProcess = cluster.fork();

		this.objPersistentWorkerIDToWorkerID[nPersistentWorkerID] = workerProcess.id;
	}


	/**
	 * @param {JSONRPC.Client} reverseCallsClient 
	 * 
	 * @returns {{plugin:JSONRPC.ClientPluginBase, workerID:number, worker:cluster.Worker}}
	 */
	async _transportPluginFromReverseClient(reverseCallsClient)
	{
		const workerTransportPlugin = reverseCallsClient.plugins.filter(plugin => plugin.worker && plugin.worker.id && plugin.worker.on)[0];

		if(!workerTransportPlugin)
		{
			throw new Error("bFreshlyCachedWorkerProxyMode needs to know the worker ID of the calling worker from incomingRequest.reverseCallsClient.plugins[?].worker.id (and it must be of type number.");
		}

		return {
			plugin: workerTransportPlugin,

			// Must uniquely identify a worker.
			workerID: workerTransportPlugin.worker.id,

			// Has to emit an "exit" event.
			worker: workerTransportPlugin.worker
		};
	}


	/**
	 * @param {JSONRPC.Server} jsonrpcServer 
	 * 
	 * @returns {JSONRPC.RouterBase}
	 */
	async _makeBidirectionalRouter(jsonrpcServer)
	{
		return new JSONRPC.BidirectionalWorkerRouter(this._jsonrpcServer);
	}

	async getPersistentIDForWorkerID(incomingRequest, nWorkerIDRequester = null)
	{
		const objWorkerState = this.objWorkerIDToState[nWorkerIDRequester];

		if(objWorkerState !== undefined)
		{
			return objWorkerState.persistentID;
		}
		else
		{
			return undefined;
		}
	}
};

module.exports = MasterEndpoint;
