const JSONRPC = {};
JSONRPC.ClientPluginBase = require("../../ClientPluginBase");

module.exports =
class DebugLogger extends JSONRPC.ClientPluginBase
{
	/**
	 * @param {number|null} nMaxMessagesCount = null
	 */
	constructor(nMaxMessagesCount = null)
	{
		super();

		this.nMaxMessagesCount = nMaxMessagesCount;
		this.nMessagesCount = 0;
	}


	/**
	 * @param {JSONRPC.OutgoingRequest} outgoingRequest
	 */
	async afterJSONEncode(outgoingRequest)
	{
		const strBody = typeof outgoingRequest.requestBody === "string" ? outgoingRequest.requestBody : JSON.stringify(outgoingRequest.requestBody);

		if(++this.nMessagesCount > this.nMaxMessagesCount)
		{
			return;
		}

		if(strBody.length > 1024 * 1024)
		{
			console.log("[" + process.pid + "] [" + (new Date()).toISOString() + "] Sent JSONRPC request, " + outgoingRequest.requestObject.method + "(). Larger than 1 MB, not logging. \n");
		}
		else
		{
			console.log("[" + process.pid + "] [" + (new Date()).toISOString() + "] Sent JSONRPC request: " + strBody + "\n");
		}
	}

	/**
	 * @param {JSONRPC.OutgoingRequest} outgoingRequest
	 */
	async beforeJSONDecode(outgoingRequest)
	{
		const strBody = typeof outgoingRequest.responseBody === "string" ? outgoingRequest.responseBody : JSON.stringify(outgoingRequest.responseBody);

		if(++this.nMessagesCount > this.nMaxMessagesCount)
		{
			return;
		}

		if(strBody.length > 1024 * 1024)
		{
			console.log("[" + process.pid + "] [" + (new Date()).toISOString() + "] Received JSONRPC response, " + outgoingRequest.requestObject.method + "(). Larger than 1 MB, not logging. \n");
		}
		else
		{
			console.log("[" + process.pid + "] [" + (new Date()).toISOString() + "] Received JSONRPC response: " + strBody + "\n");
		}
	}
};
