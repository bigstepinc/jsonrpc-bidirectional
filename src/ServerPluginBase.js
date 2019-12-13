const EventEmitter = require("events");


/**
 * @event disposed
 */
class ServerPluginBase extends EventEmitter
{
	/**
	 * Called before JSON parsing of the JSONRPC request.
	 * 
	 * @param {JSONRPC.IncomingRequest} incomingRequest
	 */
	async beforeJSONDecode(incomingRequest)
	{
		// incomingRequest.body has been populated or may be populated here.
	}


	/**
	 * Called after JSON parsing of the JSONRPC request.
	 * 
	 * @param {JSONRPC.IncomingRequest} incomingRequest
	 */
	async afterJSONDecode(incomingRequest)
	{
		// incomingRequest.requestObject has been populated.
	}


	/**
	 * If a plugin chooses to actually make the call here, 
	 * it must set the result in the incomingRequest.callResult property.
	 * 
	 * @param {JSONRPC.IncomingRequest} incomingRequest
	 */
	async callFunction(incomingRequest)
	{
		// Useful here:
		// incomingRequest.requestObject.method
		// incomingRequest.requestObject.params

		// incomingRequest.callResult may be populated here with an Error class instance, or the function return.
	}


	/**
	 * This is called after a function has been called successfully.
	 * 
	 * @param {JSONRPC.IncomingRequest} incomingRequest
	 */
	async result(incomingRequest)
	{
		// incomingRequest.callResult contains what the function call returned. 
	}


	/**
	 * This is called if a function was not called successfully.
	 * 
	 * @param {JSONRPC.IncomingRequest} incomingRequest
	 */
	async exceptionCatch(incomingRequest)
	{
		// incomingRequest.callResult contains a subclass instance of Error.
	}


	/**
	 * This is called with the actual response object.
	 * 
	 * objResponse is a standard JSONRPC 2.0 response object.
	 * 
	 * @param {JSONRPC.IncomingRequest} incomingRequest
	 */
	async response(incomingRequest)
	{
		// Gives a chance to modify the server response object before sending it out.

		// incomingRequest.callResultToBeSerialized is available here.

		// Normally, this allows extending the protocol.
	}


	/**
	 * This is called with the actual response object.
	 * 
	 * objResponse is a standard JSONRPC 2.0 response object.
	 * 
	 * @param {JSONRPC.IncomingRequest} incomingRequest
	 */
	async afterSerialize(incomingRequest)
	{
		// Gives a chance to modify the serialized server response string (or something else) before sending it out.

		// incomingRequest.callResultSerialized is available here.

		// Normally, this allows extending the protocol.
	}


	/**
	 * @returns {null}
	 */
	dispose()
	{
		this.emit("disposed");
	}
};

module.exports = ServerPluginBase;
