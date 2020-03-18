const cluster = require("cluster");
const NodeMultiCoreCPUBase = require("../NodeMultiCoreCPUBase");

const JSONRPC = {
	BidirectionalWorkerRouter: require("../BidirectionalWorkerRouter")
};

/**
 * Extend this class to export extra worker RPC APIs.
 * 
 * Counter-intuitively, this endpoint instantiates its own JSONRPC.Server and JSONRPC.BidirectionalWorkerRouter,
 * inside .start().
 */
class WorkerEndpoint extends NodeMultiCoreCPUBase.WorkerEndpoint
{
	constructor(classReverseCallsClient = null)
	{
		if(classReverseCallsClient === null)
		{
			classReverseCallsClient = require("./MasterClient");
		}

		console.log(`Fired up cluster ${cluster.isWorker ? "worker" : "master"} with PID ${process.pid}`);

		if(cluster.isMaster)
		{
			throw new Error("WorkerEndpoint can only be instantiated in a worker process.");
		}
		
		super(classReverseCallsClient);
	}


	/**
	 * @returns {number}
	 */
	async _currentWorkerID()
	{
		return cluster.worker.id;
	}


	/**
	 * @returns {process}
	 */
	async _currentWorker()
	{
		return process;
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

module.exports = WorkerEndpoint;
