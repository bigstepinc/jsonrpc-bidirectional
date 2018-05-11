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
		return this.rpc("gracefulExit", [], /*bNotification*/ true);
	}


	/**
	 * This works as an internal router to a JSONRPC.Server's endpoints, used as libraries.
	 * 
	 * Proxies RPC requests directly into potentially an internet facing JSONRPC.Server's registered endpoints.
	 * 
	 * strEndpointPath is an endpoint path such as "/api-ws/ipc/bsi".
	 * 
	 * **************** SKIPS ANY AUTHENTICATION OR AUTHORIZATION LAYERS***********************
	 * ****************     as well as any other JSONRPC plugins    ***************************
	 * 
	 * @param {string} strEndpointPath
	 * @param {string} strFunctionName
	 * @param {Array} arrParams
	 * @param {boolean} bNotification = false
	 */
	async rpcToInternalEndpointAsLibrary(strEndpointPath, strFunctionName, arrParams, bNotification = false)
	{
		return this.rpc("rpcToInternalEndpointAsLibrary", [...arguments]);
	}
};

module.exports = WorkerClient;
