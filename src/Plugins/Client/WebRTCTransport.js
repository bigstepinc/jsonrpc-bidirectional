const JSONRPC = {};
JSONRPC.ClientPluginBase = require("../../ClientPluginBase");
JSONRPC.Utils = require("../../Utils");

const assert = require("assert");


module.exports =
class WebRTCTransport extends JSONRPC.ClientPluginBase
{
	/**
	 * @param {RTCDataChannel} dataChannel
	 * @param {boolean|undefined} bBidirectionalWebRTCMode
	 */
	constructor(dataChannel, bBidirectionalWebRTCMode)
	{
		super();
		

		// JSONRPC call ID as key, {promise: {Promise}, fnResolve: {Function}, fnReject: {Function}, outgoingRequest: {OutgoingRequest}} as values.
		this._objRTCDataChannelRequestsPromises = {};


		this._bBidirectionalWebRTCMode = !!bBidirectionalWebRTCMode;
		this._dataChannel = dataChannel;

		
		this._setupRTCDataChannel();
	}


	/**
	 * @returns {RTCDataChannel} 
	 */
	get dataChannel()
	{
		return this._dataChannel;
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

				if(this._dataChannel.readyState === "open")
				{
					this._dataChannel.close();
				}

				return;
			}
		}

		if(
			(
				typeof objResponse.id !== "number"
				&& typeof objResponse.id !== "string"
			)
			|| !this._objRTCDataChannelRequestsPromises[objResponse.id]
		)
		{
			console.error(new Error("Couldn't find JSONRPC response call ID in this._objRTCDataChannelRequestsPromises. RAW response: " + strResponse));
			console.error(new Error("RAW remote message: " + strResponse));
			console.log("[" + process.pid + "] Unclean state. Unable to match WebRTC message to an existing Promise or qualify it as a request.");

			if(this._dataChannel.readyState === "open")
			{
				this.dataChannel.close(
					/*CLOSE_NORMAL*/ 1000, // Chrome only supports 1000 or the 3000-3999 range ///* CloseEvent.Internal Error */ 1011, 
					"Unclean state. Unable to match WebRTC message to an existing Promise or qualify it as a request."
				);
			}

			return;
		}

		this._objRTCDataChannelRequestsPromises[objResponse.id].outgoingRequest.responseBody = strResponse;
		this._objRTCDataChannelRequestsPromises[objResponse.id].outgoingRequest.responseObject = objResponse;

		this._objRTCDataChannelRequestsPromises[objResponse.id].fnResolve(null);
		// Sorrounding code will parse the result and throw if necessary. fnReject is not going to be used in this function.

		delete this._objRTCDataChannelRequestsPromises[objResponse.id];
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

		if(this.dataChannel.readyState !== "open")
		{
			throw new Error("RTCDataChannel not connected.");
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
			
			this._objRTCDataChannelRequestsPromises[outgoingRequest.requestObject.id] = {
				// unixtimeMilliseconds: (new Date()).getTime(),
				outgoingRequest: outgoingRequest,
				promise: null
			};

			this._objRTCDataChannelRequestsPromises[outgoingRequest.requestObject.id].promise = new Promise((fnResolve, fnReject) => {
				this._objRTCDataChannelRequestsPromises[outgoingRequest.requestObject.id].fnResolve = fnResolve;
				this._objRTCDataChannelRequestsPromises[outgoingRequest.requestObject.id].fnReject = fnReject;
			});
		}


		this.dataChannel.send(outgoingRequest.requestBody);


		if(outgoingRequest.isNotification)
		{
			// JSONRPC 2.0 notification requests don't have the id property at all, not even null. JSONRPC 2.0 servers do not send a response at all for these types of requests.
		}
		else
		{
			return this._objRTCDataChannelRequestsPromises[outgoingRequest.requestObject.id].promise;
		}
	}


	/**
	 * @param {Error} error
	 */
	rejectAllPromises(error)
	{
		//console.error(error);
		console.log("[" + process.pid + "] Rejecting all Promise instances in WebRTCTransport.");

		let nCount = 0;

		for(let nCallID in this._objRTCDataChannelRequestsPromises)
		{
			this._objRTCDataChannelRequestsPromises[nCallID].fnReject(error);
			delete this._objRTCDataChannelRequestsPromises[nCallID];

			nCount++;
		}

		if(nCount)
		{
			console.error("[" + process.pid + "] Rejected " + nCount + " Promise instances in WebRTCTransport.");
		}
	}


	/**
	 * @protected
	 */
	_setupRTCDataChannel()
	{
		const fnOnError = (error) => {
			this.rejectAllPromises(error);
		};
		const fnOnMessage = async (messageEvent) => {
			await this.processResponse(messageEvent.data);
		};
		const fnOnClose = (closeEvent) => {
			this.rejectAllPromises(new Error("RTCDataChannel closed."));

			this._dataChannel.removeEventListener("close", fnOnClose);
			this._dataChannel.removeEventListener("error", fnOnError);
	
			if(!this._bBidirectionalWebRTCMode)
			{
				this._dataChannel.removeEventListener("message", fnOnMessage);
			}
		};

		
		this._dataChannel.addEventListener("close", fnOnClose);
		this._dataChannel.addEventListener("error", fnOnError);

		if(!this._bBidirectionalWebRTCMode)
		{
			this._dataChannel.addEventListener("message", fnOnMessage);
		}
	}
};
