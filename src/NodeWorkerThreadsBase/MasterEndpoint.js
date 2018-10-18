const NodeMultiCoreCPUBase = require("../NodeMultiCoreCPUBase");

const JSONRPC = {
	BidirectionalWorkerThreadRouter: require("../BidirectionalWorkerThreadRouter")
};

const sleep = require("sleep-promise");

const os = require("os");

let Threads;
try
{
	Threads = require("worker_threads");
}
catch(error)
{
	// console.error(error);
}


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
	constructor(classReverseCallsClient)
	{
		console.log(`Fired up ${Threads.isMainThread ? "main" : "worker"} thread with threadId ${Threads.threadId}`);

		if(!Threads.isMainThread)
		{
			throw new Error("MasterEndpoint can only be instantiated in the main thread.");
		}

		super(classReverseCallsClient);
	}


	async _configureBeforeStart()
	{
	}


	async _addWorker()
	{
		const workerThread = new Threads.Worker(process.mainModule.filename);

		const nThreadID = workerThread.threadId;

		this.objWorkerIDToState[nThreadID] = {
			client: null,
			ready: false
		};

		console.log("Adding worker thread ID " + nThreadID + " to BidirectionalWorkerThreadRouter.");

		workerThread.on(
			"exit",
			async(nExitCode) => {
				try
				{
					console.log(`Worker thread with threadId  ${nThreadID} died. Exit code: ${nExitCode}.`);
					
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
							this._addWorker();
						}
					}
				}
				catch(error)
				{
					console.error("Main worker thread, when a child worker thread exited: unexpected error when handling the exit. Don't know how to handle. Exiting...", error);
					process.exit(1);
				}
			}
		);

		try
		{
			const nConnectionID = await this._bidirectionalWorkerRouter.addWorker(workerThread, /*strEndpointPath*/ this.path, 120 * 1000 /*Readiness timeout in milliseconds*/);

			this.objWorkerIDToState[nThreadID].client = this._bidirectionalWorkerRouter.connectionIDToSingletonClient(nConnectionID, this.ReverseCallsClientClass);

			this.emit("workerReady", this.objWorkerIDToState[nThreadID].client);
		}
		catch(error)
		{
			console.error("Main worker thread, when adding new worker thread: unexpected error. Don't know how to handle. Exiting", error);
			process.exit(1);
		}
	}


	/**
	 * @param {JSONRPC.Client} reverseCallsClient 
	 * 
	 * @returns {{plugin:JSONRPC.ClientPluginBase, workerID:number, worker:cluster.Worker}}
	 */
	async _transportPluginFromReverseClient(reverseCallsClient)
	{
		const workerThreadTransportPlugin = reverseCallsClient.plugins.filter(plugin => plugin.threadWorker && plugin.threadWorker.threadId && plugin.threadWorker.on)[0];

		if(!workerThreadTransportPlugin)
		{
			throw new Error("bFreshlyCachedWorkerProxyMode needs to know the worker ID of the calling worker thread from incomingRequest.reverseCallsClient.plugins[?].threadWorker.threadId (and it must be of type number.");
		}

		return {
			plugin: workerThreadTransportPlugin,
			
			// Must uniquely identify a worker thread.
			workerID: workerThreadTransportPlugin.threadWorker.threadId,

			// Has to emit an "exit" event.
			worker: workerThreadTransportPlugin.threadWorker
		};
	}


	/**
	 * @returns {JSONRPC.RouterBase}
	 */
	async _makeBidirectionalRouter()
	{
		return new JSONRPC.BidirectionalWorkerThreadRouter(this._jsonrpcServer);
	}
};

module.exports = MasterEndpoint;
