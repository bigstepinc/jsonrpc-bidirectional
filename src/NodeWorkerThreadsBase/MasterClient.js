const NodeMultiCoreCPUBase = require("../NodeMultiCoreCPUBase");

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
 * Extend this class to link to extra master RPC APIs on workers.
 */
class MasterClient extends NodeMultiCoreCPUBase.MasterClient
{
    async getPersistentIDForWorkerID(nWorkerIDRequester = null)
	{
		if(nWorkerIDRequester === null && !Threads.isMainThread)
		{
			nWorkerIDRequester = Threads.threadId;
		}

		return this.rpc("getPersistentIDForWorkerID", [nWorkerIDRequester]);
	}
};

module.exports = MasterClient;
