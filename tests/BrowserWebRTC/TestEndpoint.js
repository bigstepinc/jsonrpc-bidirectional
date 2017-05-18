"use strict";
/* eslint-disable */

/**
 * Keep everything IE10 compatible, so it can be tested there as well.
 * 
 * @class
 */
class TestEndpoint extends JSONRPC.EndpointBase
{
	constructor()
	{
		super(
			/*strName*/ "Test", 
			/*strPath*/ "/api", 
			/*objReflection*/ {},
			/*classReverseCallsClient*/ JSONRPC.Client
		);

		// Theoretically, this browser application should be able to hold multiple connections.
		// Keeping it simple for example purposes.
		this._nRTCConnectionID = null;
		this._rtcConnection = null;
		this._rtcDataChannel = null;
	}


	/** 
	 * @param {number} nRTCConnectionID
	 * 
	 * @returns {RTCDataChannel}
	 */
	getRTCDataChannel(nRTCConnectionID)
	{
		if(nRTCConnectionID !== this._nRTCConnectionID)
		{
			throw new Error("Unknown connection ID.");
		}

		if(!this._rtcDataChannel)
		{
			throw new Error("Data channel does not exist yet.");
		}

		if(this._rtcDataChannel.readyState !== "open")
		{
			throw new Error("Data channel is in readyState " + this._rtcDataChannel.readyState + ".");
		}

		return this._rtcDataChannel;
	}


	/**
	 * @param {JSONRPC.IncomingRequest} incomingRequest
	 * @param {number} nRTCConnectionID
	 * @param {Array} arrIceServers
	 */
	async makeOffer(incomingRequest, nRTCConnectionID, arrIceServers)
	{
		this._nRTCConnectionID = nRTCConnectionID;

		this._rtcConnection = new RTCPeerConnection(
			{
				iceServers: arrIceServers
			},
			{
				"mandatory": {
					"OfferToReceiveAudio": false,
					"OfferToReceiveVideo": false
				}
			}
		);

		this._rtcConnection.addEventListener(
			"connectionstatechange",
			(event) => {
				// @TODO: how to handle "failed" and "disconnected"? The same as "closed"?
				if(this._rtcConnection.connectionState === "closed")
				{
					this.breakUpRTCConnection(/*incomingRequest*/ null, nRTCConnectionID);
				}
			}
		);


		this._rtcConnection.onicecandidate = async (event) => {
			await incomingRequest.reverseCallsClient.rpc("webRTCAddIceCandidate", [nRTCConnectionID, event.candidate]);
		};


		this._rtcDataChannel = this._rtcConnection.createDataChannel(this.path, {protocol: "jsonrpc"});
		//this._rtcDataChannel.onmessage = console.log;
		//this._rtcDataChannel.onerror = console.error;
		this._rtcDataChannel.addEventListener(
			"close",
			() => {
				this.breakUpRTCConnection(/*incomingRequest*/ null, nRTCConnectionID);
			}
		);

		const offer = await this._rtcConnection.createOffer();
		this._rtcConnection.setLocalDescription(new RTCSessionDescription(offer));

		return offer;
	}


	/**
	 * @param {JSONRPC.IncomingRequest} incomingRequest
	 * @param {number} nRTCConnectionID
	 * @param {Object} objOffer
	 * @param {Array} arrIceServers
	 */
	async makeAnswer(incomingRequest, nRTCConnectionID, objOffer, arrIceServers)
	{
		this._nRTCConnectionID = nRTCConnectionID;

		this._rtcConnection = new RTCPeerConnection(
			{
				iceServers: arrIceServers
			},
			{
				"mandatory": {
					"OfferToReceiveAudio": false,
					"OfferToReceiveVideo": false
				}
			}
		);

		this._rtcConnection.addEventListener(
			"connectionstatechange",
			(event) => {
				// @TODO: how to handle "failed" and "disconnected"? The same as "closed"?
				if(this._rtcConnection.connectionState === "closed")
				{
					this.breakUpRTCConnection(/*incomingRequest*/ null, nRTCConnectionID);
				}
			}
		);

		this._rtcConnection.setRemoteDescription(new RTCSessionDescription(objOffer));

		const answer = await this._rtcConnection.createAnswer();
		this._rtcConnection.setLocalDescription(new RTCSessionDescription(answer));

		
		this._rtcConnection.onicecandidate = async (event) => {
			await incomingRequest.reverseCallsClient.rpc("webRTCAddIceCandidate", [nRTCConnectionID, event.candidate]);
		};


		this._rtcConnection.ondatachannel = async (event) => {
			if(event.channel.protocol === "jsonrpc")
			{
				if(JSONRPC.EndpointBase.normalizePath(event.channel.label) !== this.path)
				{
					throw new Error("Both ends of a RTCConnection must have the same endpoint path property value. Incoming value: " + JSONRPC.EndpointBase.normalizePath(event.channel.label) + ". This endpoint's value: " + this.path);
				}

				this._rtcDataChannel = event.channel;

				//this._rtcDataChannel.onmessage = console.log;
				//this._rtcDataChannel.onerror = console.error;
				this._rtcDataChannel.addEventListener(
					"close",
					() => {
						this.breakUpRTCConnection(/*incomingRequest*/ null, nRTCConnectionID);
					}
				);

				// Init JSONRPC over WebRTC data channel here.
				await incomingRequest.reverseCallsClient.rpc("femaleDataChannelIsOpen", [nRTCConnectionID]);

				//this._rtcDataChannel.send("test from female.");
			}
			else
			{
				console.log("Ignoring event.channel.protocol: " + event.channel.protocol);
			}
		};

		return answer;
	}


	/**
	 * @param {JSONRPC.IncomingRequest} incomingRequest
	 * @param {number} nRTCConnectionID
	 * @param {Object} objAnswer
	 */
	async thatsWhatSheSaid(incomingRequest, nRTCConnectionID, objAnswer)
	{
		if(nRTCConnectionID !== this._nRTCConnectionID)
		{
			throw new Error("Unknown connection ID.");
		}

		this._rtcConnection.setRemoteDescription(new RTCSessionDescription(objAnswer));
	}


	/**
	 * @param {JSONRPC.IncomingRequest} incomingRequest
	 * @param {number} nRTCConnectionID
	 * @param {Object} objRTCIceCandidate
	 */
	async webRTCAddIceCandidate(incomingRequest, nRTCConnectionID, objRTCIceCandidate)
	{
		if(nRTCConnectionID !== this._nRTCConnectionID)
		{
			throw new Error("Unknown connection ID.");
		}

		try
		{
			await this._rtcConnection.addIceCandidate(objRTCIceCandidate);
		}
		catch(error)
		{
			if(error.message.includes("Candidate missing values for both sdpMid and sdpMLineIndex"))
			{
				// Chrome weird error, everything works fine.
			}
			else
			{
				throw error;
			}
		}
	}


	/**
	 * @param {JSONRPC.IncomingRequest | null} incomingRequest
	 * @param {number} nRTCConnectionID
	 */
	async breakUpRTCConnection(incomingRequest, nRTCConnectionID)
	{
		if(this._rtcConnection)
		{
			this._rtcConnection.close();
		}
		this._rtcConnection = null;
		this._nRTCConnectionID = null;
		this._rtcDataChannel = null;
	}


	/**
	 * @param {JSONRPC.IncomingRequest} incomingRequest
	 * @param {number} nRTCConnectionID
	 */
	async femaleDataChannelIsOpen(incomingRequest, nRTCConnectionID)
	{
		// Init JSONRPC over WebRTC data channel here.
		// this._rtcDataChannel.send("test from male.");
	}


	/**
	 * @param {JSONRPC.IncomingRequest} incomingRequest
	 * @param {string} strReturn
	 */
	async ping(incomingRequest, strReturn)
	{
		if(strReturn !== "Yes!")
		{
			if(await incomingRequest.reverseCallsClient.rpc("ping", ["Yes!"]) !== "Yes!")
			{
				throw new Error("I think we need to see other browsers!");
			}
		}

		return strReturn;
	}
};

