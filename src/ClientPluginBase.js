/**
 * JSONRPC.Client plugins need to extend this class.
 */
module.exports =
class ClientPluginBase
{
	/**
	 * Gives a chance to modify the client request object before sending it out.
	 * 
	 * Normally, this allows extending the protocol.
	 * 
	 * @param {JSONRPC.OutgoingRequest} jsonrpcRequest
	 */
	async beforeJSONEncode(jsonrpcRequest)
	{
		// jsonrpcRequest.requestObject is available here.

		// jsonrpcRequest.headers and jsonrpcRequest.enpointURL may be modified here.
	}


	/**
	 * Gives a chance to encrypt, sign or log RAW outgoing requests.
	 * 
	 * @param {JSONRPC.OutgoingRequest} jsonrpcRequest
	 */
	async afterJSONEncode(jsonrpcRequest)
	{
		// jsonrpcRequest.requestBody is available here.

		// jsonrpcRequest.headers and jsonrpcRequest.enpointURL may be modified here.
	}


	/**
	 * If a plugin chooses to actually make the call here, 
	 * it must set the result in the jsonrpcRequest.callResult property.
	 * 
	 * @param {JSONRPC.OutgoingRequest} jsonrpcRequest
	 * 
	 * @returns {Promise.<null>}
	 */
	async makeRequest(jsonrpcRequest)
	{
		// jsonrpcRequest.callResult may be written here.
	}


	/**
	 * @param {JSONRPC.OutgoingRequest} jsonrpcRequest
	 */
	async beforeJSONDecode(jsonrpcRequest)
	{
		// jsonrpcRequest.responseBody is available here.
	}


	/**
	 * @param {JSONRPC.OutgoingRequest} jsonrpcRequest
	 */
	async afterJSONDecode(jsonrpcRequest)
	{
		// jsonrpcRequest.responseObject is available here.
	}


	/**
	 * Should be used to log exceptions or replace exceptions with other exceptions.
	 * 
	 * This is only called if jsonrpcRequest.callResult is a subclass of Error or an instance of Error.
	 * 
	 * @param {JSONRPC.OutgoingRequest} jsonrpcRequest
	 */
	async exceptionCatch(jsonrpcRequest)
	{
		// jsonrpcRequest.callResult is available here, and it is a subclass of Error.
	}
};
