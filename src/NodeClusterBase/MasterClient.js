const cluster = require("cluster");

const NodeMultiCoreCPUBase = require("../NodeMultiCoreCPUBase");

/**
 * Extend this class to link to extra master RPC APIs on workers.
 */
class MasterClient extends NodeMultiCoreCPUBase.MasterClient
{
    async getPersistentIDForWorkerID(nWorkerIDRequester = null)
	{
		if(nWorkerIDRequester === null && !cluster.isMaster)
		{
			nWorkerIDRequester = cluster.worker.id;
		}

		return this.rpc("getPersistentIDForWorkerID", [nWorkerIDRequester]);
	}
};

module.exports = MasterClient;
