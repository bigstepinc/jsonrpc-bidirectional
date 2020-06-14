const NodeMultiCoreCPUBase = require("../NodeMultiCoreCPUBase");

const JSONRPC = {
	BidirectionalWorkerThreadRouter: require("../BidirectionalWorkerThreadRouter")
};

const sleep = require("sleep-promise");

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
 * Extend this class to export extra worker RPC APIs.
 * 
 * Counter-intuitively, this endpoint instantiates its own JSONRPC.Server and JSONRPC.BidirectionalWorkerRouter,
 * inside .start().
 */
class WorkerEndpoint extends NodeMultiCoreCPUBase.WorkerEndpoint
{
	constructor(classReverseCallsClient)
	{
		console.log(`Fired up ${Threads.isMainThread ? "main" : "worker"} thread with threadId ${Threads.threadId}`);

		if(Threads.isMainThread)
		{
			throw new Error("WorkerEndpoint can only be instantiated in a worker thread.");
		}
		
		super(classReverseCallsClient);
	}


	/**
	 * @returns {number}
	 */
	async _currentWorkerID()
	{
		// https://github.com/nodejs/node/issues/1269
		if(
			!this._bAlreadyDelayedReadingWorkerID
			&& (
				!Threads
				|| Threads.threadId === null 
				|| Threads.threadId === undefined
			)
		)
		{
			await sleep(2000);
			this._bAlreadyDelayedReadingWorkerID = true;
		}


		if(
			!Threads
			|| Threads.threadId === null 
			|| Threads.threadId === undefined
		)
		{
			console.error("Threads: ", Threads);
			console.error("Threads.threadId: ", Threads ? Threads.threadId : "");
			console.error(`Returning 0 as Threads.threadId.`);
			return 0;
		}

		return Threads.threadId;
	}


	/**
	 * @returns {worker_threads}
	 */
	async _currentWorker()
	{
		return Threads;
	}


	/**
	 * @param {JSONRPC.Server} jsonrpcServer 
	 * 
	 * @returns {JSONRPC.RouterBase}
	 */
	async _makeBidirectionalRouter(jsonrpcServer)
	{
		return new JSONRPC.BidirectionalWorkerThreadRouter(this._jsonrpcServer);
	}
};

module.exports = WorkerEndpoint;
