const JSONRPC = {
	Client: require("../Client")
};


/**
 * Extend this class to link to extra master RPC APIs on workers.
 */
class MasterClient extends JSONRPC.Client
{
	/**
	 * Signals a worker's JSONRPC endpoint is ready to receive calls.
	 * 
	 * @param {number} nWorkerID
	 */
	async workerServicesReady(nWorkerID)
	{
		return this.rpc("workerServicesReady", [nWorkerID]);
	}


	/**
	 * @returns {never}
	 */
	async gracefulExit()
	{
		return this.rpc("gracefulExit", []);
	}


	/**
	 * @param {string} strReturn
	 * 
	 * @returns {string}
	 */
	async ping(strReturn)
	{
		return this.rpc("ping", [strReturn]);
	}
};

module.exports = MasterClient;
