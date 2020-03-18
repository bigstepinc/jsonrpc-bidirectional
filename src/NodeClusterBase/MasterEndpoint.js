const cluster = require("cluster");
const os = require("os");
// const assert = require("assert");

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
			async(worker, nExitCode, nKillSignal) => {
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
	}


	async _addWorker()
	{
		cluster.fork();
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
};

module.exports = MasterEndpoint;
