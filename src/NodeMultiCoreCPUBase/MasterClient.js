const JSONRPC = {
	Client: require("../Client")
};


/**
 * Extend this class to link to extra master RPC APIs on workers.
 */
class MasterClient extends JSONRPC.Client
{
	/**
	 * Signals to the master, that this worker's JSONRPC endpoint is ready to receive calls.
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

	async sendTransferListTest(arrayBufferForTest)
	{
		return this.rpc("sendTransferListTest", [...arguments], /*bNotification*/ true, [arrayBufferForTest]);
	}

	/**
	 * @param {number} nWorkerID
	 * @param {string} strFunctionName
	 * @param {Array} arrParams
	 * @param {boolean} bNotification = false
	 * 
	 * @returns {*}
	 */
	async rpcWorker(nWorkerID, strFunctionName, arrParams, bNotification = false)
	{
		return this.rpc("rpcWorker", [...arguments]);
	}

	async getMyPersistentWorkerID()
	{
		throw new Error("Subclass must implement getMyPersistentWorkerID()");
	}
};

module.exports = MasterClient;
