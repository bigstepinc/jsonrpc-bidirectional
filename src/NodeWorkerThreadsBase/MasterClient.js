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
    constructor()
	{
		super(...arguments);

		this._promiseGetMyPersistentWorkerID;
    }
    
    async getMyPersistentWorkerID()
	{
		if(this._promiseGetMyPersistentWorkerID === undefined)
		{
			this._promiseGetMyPersistentWorkerID = new Promise((fnResolve, fnReject) => {
                const nWorkerIDRequester = Threads.threadId;
				fnResolve(this.rpc("getMyPersistentWorkerID", [nWorkerIDRequester]));
			});
		}

		return await this._promiseGetMyPersistentWorkerID;
	}
};

module.exports = MasterClient;
