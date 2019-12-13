const EventEmitter = require("events");


/**
 * JSONRPC.Client plugins need to extend this class.
 */
class ClientPluginBase extends EventEmitter
{
	/**
	 * Gives a chance to modify the client request object before sending it out.
	 * 
	 * Normally, this allows extending the protocol.
	 * 
	 * @param {JSONRPC.OutgoingRequest} outgoingRequest
	 */
	async beforeJSONEncode(outgoingRequest)
	{
		// outgoingRequest.requestObject is available here.

		// outgoingRequest.headers and outgoingRequest.enpointURL may be modified here.
		// outgoingRequest.requestBody may be set to a non-NULL value to replace JSON.stringy() (and thus replace serialization).
	}


	/**
	 * Gives a chance to encrypt, sign or log RAW outgoing requests.
	 * 
	 * @param {JSONRPC.OutgoingRequest} outgoingRequest
	 */
	async afterJSONEncode(outgoingRequest)
	{
		// outgoingRequest.requestBody is available here.

		// outgoingRequest.headers and outgoingRequest.enpointURL may be modified here.
	}


	/**
	 * If a plugin chooses to actually make the call here, 
	 * it must set the result in the outgoingRequest.callResult property.
	 * 
	 * @param {JSONRPC.OutgoingRequest} outgoingRequest
	 * 
	 * @returns {Promise.<null>}
	 */
	async makeRequest(outgoingRequest)
	{
		// outgoingRequest.callResult may be written here.
	}


	/**
	 * @param {JSONRPC.OutgoingRequest} outgoingRequest
	 */
	async beforeJSONDecode(outgoingRequest)
	{
		// outgoingRequest.responseBody is available here.
		// outgoingRequest.responseObject may be set to a non-NULL value to replace JSON.parse() (and thus replace serialization).
	}


	/**
	 * @param {JSONRPC.OutgoingRequest} outgoingRequest
	 */
	async afterJSONDecode(outgoingRequest)
	{
		// outgoingRequest.responseObject is available here.
	}


	/**
	 * Should be used to log exceptions or replace exceptions with other exceptions.
	 * 
	 * This is only called if outgoingRequest.callResult is a subclass of Error or an instance of Error.
	 * 
	 * @param {JSONRPC.OutgoingRequest} outgoingRequest
	 */
	async exceptionCatch(outgoingRequest)
	{
		// outgoingRequest.callResult is available here, and it is a subclass of Error.
	}


	/**
	 * @returns {null}
	 */
	dispose()
	{
		this.emit("disposed");
	}
};


module.exports = ClientPluginBase;
