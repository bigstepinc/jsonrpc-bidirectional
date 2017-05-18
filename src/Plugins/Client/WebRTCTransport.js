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
			typeof objResponse.id !== "number"
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

		assert(typeof outgoingRequest.requestObject.id === "number", "outgoingRequest.requestObject.id must be of type number.");
		
		this._objRTCDataChannelRequestsPromises[outgoingRequest.requestObject.id] = {
			// unixtimeMilliseconds: (new Date()).getTime(),
			outgoingRequest: outgoingRequest,
			promise: null
		};

		this._objRTCDataChannelRequestsPromises[outgoingRequest.requestObject.id].promise = new Promise((fnResolve, fnReject) => {
			this._objRTCDataChannelRequestsPromises[outgoingRequest.requestObject.id].fnResolve = fnResolve;
			this._objRTCDataChannelRequestsPromises[outgoingRequest.requestObject.id].fnReject = fnReject;
		});

		this.dataChannel.send(outgoingRequest.requestBody);

		return this._objRTCDataChannelRequestsPromises[outgoingRequest.requestObject.id].promise;
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
		this._dataChannel.addEventListener(
			"close", 
			(closeEvent) => {
				this.rejectAllPromises(new Error("RTCDataChannel closed."));
			}
		);
		
		this._dataChannel.addEventListener(
			"error",
			(error) => {
				this.rejectAllPromises(error);
			}
		);

		if(!this._bBidirectionalWebRTCMode)
		{
			this._dataChannel.addEventListener(
				"message",
				async (messageEvent) => {
					await this.processResponse(messageEvent.data);
				}
			);
		}
	}
};
