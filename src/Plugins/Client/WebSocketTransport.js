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

		this.webSocket = webSocket;

		// JSONRPC call ID as key, {promise: {Promise}, fnResolve: {Function}, fnReject: {Function}} as values.
		this._objWebSocketRequestsPromises = {};

		this.webSocket.on(
			"close", 
			(code, message) => {
				this.rejectAllPromises(new Error("WebSocket closed. Code: " + JSON.stringify(code) + ". Message: " + JSON.stringify(message) + "."));
			}
		);
		
		this.webSocket.on(
			"error",
			(error) => {
				this.rejectAllPromises(error);
			}
		);

		this.webSocket.on(
			"message", 
			(strResponse) => {
				let objResponse;

				try
				{
					objResponse = JSON.parse(strResponse);

					if(
						!(typeof objResponse.id === "number")
						|| !this._objWebSocketRequestsPromises[objResponse.id]
					)
					{
						throw new Error("Couldn't find JSONRPC response call ID in this._objWebSocketRequestsPromises.");
					}

					assert(this._objWebSocketRequestsPromises[objResponse.id]);
				}
				catch(error)
				{
					console.error(error);
					console.error("RAW remote message: " + strResponse);
					console.log("Unclean state. Unable to match WebSocket message to an existing Promise or qualify it as a request.");
					this.webSocket.close(1, "Unclean state. Unable to match WebSocket message to an existing Promise or qualify it as a request.");

					return;
				}

				if(objResponse.method)
				{
					// Ignore this, it is a request.
					// This may be a websocket shared between a Client and a Server for bi-directional RPC.
				}
				else
				{
					this._objWebSocketRequestsPromises[objResponse.id].fnResolve(strResponse);
					// Sorrounding code will parse the result and throw if necessary. fnReject is not going to be used in this function.

					delete this._objWebSocketRequestsPromises[objResponse.id];
				}
			}
		);
	}


	/**
	 * @param {Object} objFilterParams
	 * @returns {Promise.<*>}. The RAW string output of the server.
	 */
	async makeRequest(objFilterParams)
	{
		objFilterParams.bCalled = true;

		if(this.webSocket.readyState !== WebSocket.OPEN)
		{
			throw new Error("WebSocket not connected.");
		}

		assert(typeof objFilterParams.nCallID === "number");
		
		this._objWebSocketRequestsPromises[objFilterParams.nCallID] = {
			unixtimeMilliseconds: (new Date()).getTime()
		};
		this._objWebSocketRequestsPromises[objFilterParams.nCallID].promise = new Promise((fnResolve, fnReject) => {
			this._objWebSocketRequestsPromises[objFilterParams.nCallID].fnResolve = fnResolve;
			this._objWebSocketRequestsPromises[objFilterParams.nCallID].fnReject = fnReject;
		});

		this.webSocket.send(objFilterParams.strJSONRequest);

		// Returning a Promise.
		return this._objWebSocketRequestsPromises[objFilterParams.nCallID].promise;
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
