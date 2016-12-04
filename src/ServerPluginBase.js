module.exports=
class ServerPluginBase
{
	/**
	 * Called before JSON parsing of the JSONRPC request.
	 * 
	 * @param {JSONRPC.Request} jsonrpcRequest
	 */
	async beforeJSONDecode(jsonrpcRequest)
	{
		// jsonrpcRequest.body has been populated or may be populated here.
	}


	/**
	 * Called after JSON parsing of the JSONRPC request.
	 * 
	 * @param {JSONRPC.Request} jsonrpcRequest
	 */
	async afterJSONDecode(jsonrpcRequest)
	{
		// jsonrpcRequest.requestObject has been populated.
	}


	/**
	 * If a plugin chooses to actually make the call here, 
	 * it must set the result in the jsonrpcRequest.callResult property.
	 * 
	 * @param {JSONRPC.Request} jsonrpcRequest
	 */
	async callFunction(jsonrpcRequest)
	{
		// Useful here:
		// jsonrpcRequest.requestObject.method
		// jsonrpcRequest.requestObject.params

		// jsonrpcRequest.callResult may be populated here with an Error class instance, or the function return.
	}


	/**
	 * This is called after a function has been called successfully.
	 * 
	 * @param {JSONRPC.Request} jsonrpcRequest
	 */
	async response(jsonrpcRequest)
	{
		// jsonrpcRequest.callResult contains what the function call returned. 
	}


	/**
	 * This is called if a function was not called successfully.
	 * 
	 * @param {JSONRPC.Request} jsonrpcRequest
	 */
	async exceptionCatch(jsonrpcRequest)
	{
		// jsonrpcRequest.callResult contains a subclass instance of Error.
	}
};
