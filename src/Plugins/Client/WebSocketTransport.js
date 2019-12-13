const JSONRPC = {};
JSONRPC.ClientPluginBase = require("../../ClientPluginBase");
JSONRPC.Utils = require("../../Utils");

JSONRPC.WebSocketAdapters = {};
JSONRPC.WebSocketAdapters.WebSocketWrapperBase = require("../../WebSocketAdapters/WebSocketWrapperBase");

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
	 * @param {object|undefined} objResponse
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

				if(this._webSocket.readyState === JSONRPC.WebSocketAdapters.WebSocketWrapperBase.OPEN)
				{
					this._webSocket.close(
						/*CLOSE_NORMAL*/ 1000, // Chrome only supports 1000 or the 3000-3999 range ///* CloseEvent.Internal Error */ 1011, 
						"Unable to parse JSON. RAW remote response: " + strResponse
					);
				}

				return;
			}
		}

		if(
			(
				typeof objResponse.id !== "number"
				&& typeof objResponse.id !== "string"
			)
			|| !this._objWebSocketRequestsPromises[objResponse.id]
		)
		{
			console.error(objResponse);
			console.error(new Error("Couldn't find JSONRPC response call ID in this._objWebSocketRequestsPromises. RAW response: " + strResponse));
			console.error(new Error("RAW remote message: " + strResponse));
			console.log("[" + process.pid + "] Unclean state. Unable to match WebSocket message to an existing Promise or qualify it as a request.");

			if(this._webSocket.readyState === JSONRPC.WebSocketAdapters.WebSocketWrapperBase.OPEN)
			{
				this.webSocket.close(
					/*CLOSE_NORMAL*/ 1000, // Chrome only supports 1000 or the 3000-3999 range ///* CloseEvent.Internal Error */ 1011, 
					"Unclean state. Unable to match WebSocket message to an existing Promise or qualify it as a request."
				);
			}

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

		if(this.webSocket.readyState !== JSONRPC.WebSocketAdapters.WebSocketWrapperBase.OPEN)
		{
			throw new Error("WebSocket not connected. Current WebSocket readyState: " + JSON.stringify(this.webSocket.readyState));
		}

		outgoingRequest.isMethodCalled = true;


		if(outgoingRequest.isNotification)
		{
			// JSONRPC 2.0 notification requests don't have the id property at all, not even null. JSONRPC 2.0 servers do not send a response at all for these types of requests.
		}
		else
		{
			/**
			 * http://www.jsonrpc.org/specification#notification
			 * 
			 * id
			 * An identifier established by the Client that MUST contain a String, Number, or NULL value if included. If it is not included it is assumed to be a notification. The value SHOULD normally not be Null [1] and Numbers SHOULD NOT contain fractional parts [2]
			 * The Server MUST reply with the same value in the Response object if included. This member is used to correlate the context between the two objects.
			 * 
			 * [1] The use of Null as a value for the id member in a Request object is discouraged, because this specification uses a value of Null for Responses with an unknown id. Also, because JSON-RPC 1.0 uses an id value of Null for Notifications this could cause confusion in handling.
			 * 
			 * [2] Fractional parts may be problematic, since many decimal fractions cannot be represented exactly as binary fractions.
			 * 
			 * =====================================
			 * 
			 * Asynchronous JSONRPC 2.0 clients must set the "id" property to be able to match responses to requests, as they arrive out of order.
			 * The "id" property cannot be null, but it can be omitted in the case of notification requests, which expect no response at all from the server.
			 */
			assert(
				typeof outgoingRequest.requestObject.id === "number" || typeof outgoingRequest.requestObject.id === "string", 
				"outgoingRequest.requestObject.id must be of type number or string."
			);
			
			this._objWebSocketRequestsPromises[outgoingRequest.requestObject.id] = {
				// unixtimeMilliseconds: (new Date()).getTime(),
				outgoingRequest: outgoingRequest,
				promise: null
			};

			this._objWebSocketRequestsPromises[outgoingRequest.requestObject.id].promise = new Promise((fnResolve, fnReject) => {
				this._objWebSocketRequestsPromises[outgoingRequest.requestObject.id].fnResolve = fnResolve;
				this._objWebSocketRequestsPromises[outgoingRequest.requestObject.id].fnReject = fnReject;
			});
		}


		this.webSocket.send(outgoingRequest.requestBody);


		if(outgoingRequest.isNotification)
		{
			// JSONRPC 2.0 notification requests don't have the id property at all, not even null. JSONRPC 2.0 servers do not send a response at all for these types of requests.
		}
		else
		{
			return this._objWebSocketRequestsPromises[outgoingRequest.requestObject.id].promise;
		}
	}


	/**
	 * @param {Error} error
	 */
	rejectAllPromises(error)
	{
		//console.error(error);

		if(Object.values(this._objWebSocketRequestsPromises).length)
		{
			console.log("[" + process.pid + "] Rejecting all Promise instances in WebSocketTransport.");
		}

		let nCount = 0;

		for(let nCallID in this._objWebSocketRequestsPromises)
		{
			this._objWebSocketRequestsPromises[nCallID].fnReject(error);
			delete this._objWebSocketRequestsPromises[nCallID];

			nCount++;
		}

		if(nCount)
		{
			console.error("[" + process.pid + "] Rejected " + nCount + " Promise instances in WebSocketTransport.");
		}
	}


	/**
	 * @protected
	 */
	_setupWebSocket()
	{
		if(this._webSocket.on && this._webSocket.removeListener && process && process.release)
		{
			const fnOnError = (error) => {
				this.rejectAllPromises(error);
			};
			const fnOnMessage = async(mxData, objFlags) => {
				await this.processResponse(mxData);
			};
			const fnOnClose = (nCode, strReason, bWasClean) => {
				this.rejectAllPromises(new Error("WebSocket closed. Code: " + JSON.stringify(nCode) + ". Message: " + JSON.stringify(strReason)));

				if(!this._bBidirectionalWebSocketMode)
				{
					this._webSocket.removeListener("message", fnOnMessage);
				}
	
				this._webSocket.removeListener("close", fnOnClose);
				this._webSocket.removeListener("error", fnOnError);
			};

			
			this._webSocket.on("error", fnOnError);
			this._webSocket.on("close", fnOnClose);

			if(!this._bBidirectionalWebSocketMode)
			{
				this._webSocket.on("message", fnOnMessage);
			}
		}
		else if(this._webSocket.addEventListener && this._webSocket.removeEventListener)
		{
			const fnOnMessage = async(messageEvent) => {
				await this.processResponse(messageEvent.data);
			};
			const fnOnError = (error) => {
				this.rejectAllPromises(error);
			};

			const fnOnClose = (closeEvent) => {
				this.rejectAllPromises(new Error("WebSocket closed. Code: " + JSON.stringify(closeEvent.code) + ". Message: " + JSON.stringify(closeEvent.reason) + ". wasClean: " + JSON.stringify(closeEvent.wasClean)));

				if(!this._bBidirectionalWebSocketMode)
				{
					this._webSocket.removeEventListener("message", fnOnMessage);
				}

				this._webSocket.removeEventListener("close", fnOnClose);
				this._webSocket.removeEventListener("error", fnOnError);
			};

			if(!this._bBidirectionalWebSocketMode)
			{
				this._webSocket.addEventListener("message", fnOnMessage);
			}

			this._webSocket.addEventListener("close", fnOnClose);
			this._webSocket.addEventListener("error", fnOnError);
		}
		else
		{
			throw new Error("Failed to detect runtime or websocket interface not support (browser, nodejs, websockets/ws npm package compatible interface, etc.");
		}
	}
};
