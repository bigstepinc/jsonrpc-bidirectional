const JSONRPC = {};
JSONRPC.ClientPluginBase = require("../../ClientPluginBase");

const assert = require("assert");
const WebSocket = require("ws");

module.export =
class WebSocketTransport extends JSONRPC.ClientPluginBase
{
	/**
	 * @param {WebSocket} webSocket
	 */
	constructor(webSocket)
	{
		super();

		assert(webSocket instanceof WebSocket);

		this._webSocket = webSocket;

		// JSONRPC call ID as key, {promise: {Promise}, fnResolve: {Function}, fnReject: {Function}, jsonrpcRequest: {OutgoingRequest}} as values.
		this._objWebSocketRequestsPromises = {};

		this._webSocket.on(
			"close", 
			(code, message) => {
				this.rejectAllPromises(new Error("WebSocket closed. Code: " + JSON.stringify(code) + ". Message: " + JSON.stringify(message) + "."));
			}
		);
		
		this._webSocket.on(
			"error",
			(error) => {
				this.rejectAllPromises(error);
			}
		);
	}


	/**
	 * @returns {WebSocket} 
	 */
	get webSocket()
	{
		return this._webSocket;
	}


	/**
	 * strResponse is a string with the response JSON.
	 * objResponse is the object obtained after JSON parsing for strResponse.
	 * 
	 * @param {string} strResponse
	 * @param {Object} objResponse
	 */
	async processResponse(strResponse, objResponse)
	{
		if(!objResponse)
		{
			try
			{
				objResponse = JSON.parse(strResponse);
			}
			catch(error)
			{
				console.error(error);
				console.error("Unable to parse JSON. RAW remote message: " + strResponse);

				this.webSocket.send(JSON.stringify({
					id: null,
					jsonrpc: "2.0",
					error: {
						message: "Invalid JSON: " + JSON.stringify(strResponse) + ".",
						code: JSONRPC.Exception.PARSE_ERROR
					}
				}, undefined, "\t"));

				console.log("Unclean state. Unable to match WebSocket message to an existing Promise or qualify it as a request or response.");
				this.webSocket.close(1, "Unclean state. Unable to match WebSocket message to an existing Promise or qualify it as a request or response.");

				return;
			}
		}


		if(
			typeof objResponse.id !== "number"
			|| !this._objWebSocketRequestsPromises[objResponse.id]
		)
		{
			console.error(new Error("Couldn't find JSONRPC response call ID in this._objWebSocketRequestsPromises."));
			console.error(new Error("RAW remote message: " + strResponse));
			console.log("Unclean state. Unable to match WebSocket message to an existing Promise or qualify it as a request.");
			this.webSocket.close(1, "Unclean state. Unable to match WebSocket message to an existing Promise or qualify it as a request.");

			return;
		}

		this._objWebSocketRequestsPromises[objResponse.id].jsonrpcRequest.responseBody = strResponse;
		this._objWebSocketRequestsPromises[objResponse.id].jsonrpcRequest.requestObject = objResponse;

		this._objWebSocketRequestsPromises[objResponse.id].fnResolve(null);
		// Sorrounding code will parse the result and throw if necessary. fnReject is not going to be used in this function.

		delete this._objWebSocketRequestsPromises[objResponse.id];
	}


	/**
	 * Populates the the OutgoingRequest class instance (jsonrpcRequest) with the RAW JSON response and the JSON parsed response object.
	 * 
	 * @param {JSONRPC.OutgoingRequest} jsonrpcRequest
	 * 
	 * @returns {Promise.<null>}
	 */
	async makeRequest(jsonrpcRequest)
	{
		if(this.webSocket.readyState !== WebSocket.OPEN)
		{
			throw new Error("WebSocket not connected.");
		}

		jsonrpcRequest.isMethodCalled = true;

		assert(typeof jsonrpcRequest.requestObject.id === "number");
		
		this._objWebSocketRequestsPromises[jsonrpcRequest.requestObject.id] = {
			unixtimeMilliseconds: (new Date()).getTime(),
			jsonrpcRequest: jsonrpcRequest
		};
		this._objWebSocketRequestsPromises[jsonrpcRequest.requestObject.id].promise = new Promise((fnResolve, fnReject) => {
			this._objWebSocketRequestsPromises[jsonrpcRequest.requestObject.id].fnResolve = fnResolve;
			this._objWebSocketRequestsPromises[jsonrpcRequest.requestObject.id].fnReject = fnReject;
		});

		this.webSocket.send(jsonrpcRequest.requestObject.requestBody);

		return this._objWebSocketRequestsPromises[jsonrpcRequest.requestObject.id].promise;
	}


	/**
	 * @param {Error} error
	 */
	rejectAllPromises(error)
	{
		console.error(error);
		console.log("Rejecting all Promise instances in WebSockets/JSONRPCClientPlugin.");

		for(let nCallID in this._objWebSocketRequestsPromises)
		{
			this._objWebSocketRequestsPromises[nCallID].fnReject(error);
			delete this._objWebSocketRequestsPromises[nCallID];
		}
	}
};
