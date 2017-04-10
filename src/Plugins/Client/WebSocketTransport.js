const JSONRPC = {};
JSONRPC.ClientPluginBase = require("../../ClientPluginBase");
JSONRPC.Utils = require("../../Utils");

const assert = require("assert");

module.exports =
class WebSocketTransport extends JSONRPC.ClientPluginBase
{
	/**
	 * @param {WebSocket} webSocket
	 * @param {boolean|undefined} bBidirectionalWebSocketMode
	 */
	constructor(webSocket, bBidirectionalWebSocketMode)
	{
		super();
		

		// JSONRPC call ID as key, {promise: {Promise}, fnResolve: {Function}, fnReject: {Function}, outgoingRequest: {OutgoingRequest}} as values.
		this._objWebSocketRequestsPromises = {};


		this._bBidirectionalWebSocketMode = !!bBidirectionalWebSocketMode;
		this._webSocket = webSocket;

		
		this._setupWebSocket();
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
	 * @param {Object|undefined} objResponse
	 */
	async processResponse(strResponse, objResponse)
	{
		if(!objResponse)
		{
			try
			{
				objResponse = JSONRPC.Utils.jsonDecodeSafe(strResponse);
			}
			catch(error)
			{
				console.error(error);
				console.error("Unable to parse JSON. RAW remote response: " + strResponse);
				this._webSocket.close(
					/* CloseEvent.Internal Error */ 1011, 
					"Unable to parse JSON. RAW remote response: " + strResponse
				);

				return;
			}
		}

		if(
			typeof objResponse.id !== "number"
			|| !this._objWebSocketRequestsPromises[objResponse.id]
		)
		{
			console.error(new Error("Couldn't find JSONRPC response call ID in this._objWebSocketRequestsPromises. RAW response: " + strResponse));
			console.error(new Error("RAW remote message: " + strResponse));
			console.log("[" + process.pid + "] Unclean state. Unable to match WebSocket message to an existing Promise or qualify it as a request.");
			this.webSocket.close(
				/* CloseEvent.Internal Error */ 1011, 
				"Unclean state. Unable to match WebSocket message to an existing Promise or qualify it as a request."
			);

			return;
		}

		this._objWebSocketRequestsPromises[objResponse.id].outgoingRequest.responseBody = strResponse;
		this._objWebSocketRequestsPromises[objResponse.id].outgoingRequest.responseObject = objResponse;

		this._objWebSocketRequestsPromises[objResponse.id].fnResolve(null);
		// Sorrounding code will parse the result and throw if necessary. fnReject is not going to be used in this function.

		delete this._objWebSocketRequestsPromises[objResponse.id];
	}


	/**
	 * Populates the the OutgoingRequest class instance (outgoingRequest) with the RAW JSON response and the JSON parsed response object.
	 * 
	 * @param {JSONRPC.OutgoingRequest} outgoingRequest
	 * 
	 * @returns {Promise.<null>}
	 */
	async makeRequest(outgoingRequest)
	{
		if(outgoingRequest.isMethodCalled)
		{
			return;
		}

		if(this.webSocket.readyState !== this.webSocket.constructor.OPEN)
		{
			throw new Error("WebSocket not connected.");
		}

		outgoingRequest.isMethodCalled = true;

		assert(typeof outgoingRequest.requestObject.id === "number");
		
		this._objWebSocketRequestsPromises[outgoingRequest.requestObject.id] = {
			unixtimeMilliseconds: (new Date()).getTime(),
			outgoingRequest: outgoingRequest
		};
		this._objWebSocketRequestsPromises[outgoingRequest.requestObject.id].promise = new Promise((fnResolve, fnReject) => {
			this._objWebSocketRequestsPromises[outgoingRequest.requestObject.id].fnResolve = fnResolve;
			this._objWebSocketRequestsPromises[outgoingRequest.requestObject.id].fnReject = fnReject;
		});

		this.webSocket.send(outgoingRequest.requestBody);

		return this._objWebSocketRequestsPromises[outgoingRequest.requestObject.id].promise;
	}


	/**
	 * @param {Error} error
	 */
	rejectAllPromises(error)
	{
		console.error(error);
		console.log("[" + process.pid + "] Rejecting all Promise instances in WebSockets/JSONRPCClientPlugin.");

		for(let nCallID in this._objWebSocketRequestsPromises)
		{
			this._objWebSocketRequestsPromises[nCallID].fnReject(error);
			delete this._objWebSocketRequestsPromises[nCallID];
		}
	}


	/**
	 * @protected
	 */
	_setupWebSocket()
	{
		//assert(webSocket.constructor.name === "WebSocket");

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

		if(!this._bBidirectionalWebSocketMode)
		{
			this._webSocket.on(
				"message",
				async (strMessage) => {
					await this.processResponse(strMessage);
				}
			);
		}
	}
};
