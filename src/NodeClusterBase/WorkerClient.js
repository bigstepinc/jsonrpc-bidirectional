const JSONRPC = {
	Client: require("../Client")
};


/**
 * Extend this class to link to extra worker RPC APIs on the master.
 */
class WorkerClient extends JSONRPC.Client
{
	/**
	 * @returns {never}
	 */
	async gracefulExit()
	{
		return this.rpc("gracefulExit", []);
	}
};

module.exports = WorkerClient;
