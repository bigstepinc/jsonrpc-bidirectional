const JSONRPC = require("../index");
JSONRPC.Exception = require("./Exception");
JSONRPC.Server = require("./Server");
JSONRPC.IncomingRequest = require("./IncomingRequest");
JSONRPC.EndpointBase = require("./EndpointBase");
JSONRPC.RouterBase = require("./RouterBase");

JSONRPC.Plugins = {};
JSONRPC.Plugins.Client = require("./Plugins/Client");
JSONRPC.Utils = require("./Utils");

/**
 * @event madeReverseCallsClient
 * The "madeReverseCallsClient" event offers automatically instantiated API clients (API clients are instantiated for each connection, lazily).
 */
module.exports =
class BidirectionalWebRTCRouter extends JSONRPC.RouterBase
{
	/**
	 * Returns the connection ID.
	 * 
	 * RTCDataChannel instances which will emit an error or close event will get automatically removed.
	 * 
	 * Already closed RTCDataChannel instances are ignored by this function.
	 * 
	 * @param {RTCDataChannel} dataChannel
	 * 
	 * @returns {number}
	 */
	async addRTCDataChannel(dataChannel)
	{
		if(dataChannel.readyState === "closed")
		{
			// "closing" should be followed by a closed event.
			// "open" is desired.
			// "connecting" should emit an error event if it will not become open.
			// @TODO: test cases for the above, somehow.

			// "closed" would not recover and should never be added, because it would not get cleaned up.
			console.log("[" + process.pid + "] addRTCDataChannel ignoring closed dataChannel.");

			return;
		}

		const nConnectionID = ++this._nConnectionIDCounter;

		const strEndpointPath = JSONRPC.EndpointBase.normalizePath(dataChannel.label);

		const objSession = {
			dataChannel: dataChannel,
			nConnectionID: nConnectionID,
			clientReverseCalls: null,
			clientWebRTCTransportPlugin: null,
			strEndpointPath: strEndpointPath
		};

		this._objSessions[nConnectionID] = objSession;
		

		dataChannel.addEventListener(
			"message", 
			async (messageEvent) => {
				await this._routeMessage(messageEvent.data, objSession);
			}
		);

		dataChannel.addEventListener(
			"close",
			(closeEvent) => {
				this.onConnectionEnded(nConnectionID);
			}
		);

		dataChannel.addEventListener(
			"error", 
			(error) => {
				this.onConnectionEnded(nConnectionID);

				if(dataChannel.readyState === "open")
				{
					dataChannel.close();
				}
			}
		);

		return nConnectionID;
	}


	/**
	 * Overridable to allow configuring the client further.
	 * 
	 * @param {Class} ClientClass
	 * @param {Object} objSession
	 * 
	 * @returns {JSONRPC.Client}
	 */
	_makeReverseCallsClient(ClientClass, objSession)
	{
		const clientReverseCalls = new ClientClass(objSession.strEndpointPath);
		
		objSession.clientWebRTCTransportPlugin = new JSONRPC.Plugins.Client.WebRTCTransport(objSession.dataChannel, /*bBidirectionalWebRTCMode*/ true);
		clientReverseCalls.addPlugin(objSession.clientWebRTCTransportPlugin);

		this.emit("madeReverseCallsClient", clientReverseCalls);

		return clientReverseCalls;
	}


	/**
	 * Routes RTCDataChannel messages to either the client or the server WenRTC plugin.
	 * 
	 * @param {string} strMessage
	 * @param {Object} objSession
	 */
	async _routeMessage(strMessage, objSession)
	{
		const dataChannel = objSession.dataChannel;
		const nConnectionID = objSession.nConnectionID;

		if(!strMessage.trim().length)
		{
			console.log("[" + process.pid + "] WebRTCBidirectionalRouter: Received empty message. Ignoring.");
			return;
		}

		let objMessage;

		try
		{
			objMessage = JSONRPC.Utils.jsonDecodeSafe(strMessage);
		}
		catch(error)
		{
			console.error(error);
			console.error("Unable to parse JSON. RAW remote message: " + strMessage);

			if(
				this._jsonrpcServer 
				&& this._objSessions.hasOwnProperty(nConnectionID)
				&& this._objSessions[nConnectionID].clientWebRTCTransportPlugin === null
				&& dataChannel.readyState === "open"
			)
			{
				dataChannel.send(JSON.stringify({
					id: null,
					jsonrpc: "2.0",
					error: {
						message: "Invalid JSON: " + JSON.stringify(strMessage) + ".",
						code: JSONRPC.Exception.PARSE_ERROR
					}
				}, undefined, "\t"));
			}

			console.log("[" + process.pid + "] Unclean state. Unable to match RTCDataChannel message to an existing Promise or qualify it as a request or response.");
			if(dataChannel.readyState === "open")
			{
				dataChannel.close();
			}

			return;
		}

		try
		{
			if(objMessage.hasOwnProperty("method"))
			{
				if(!this._jsonrpcServer)
				{
					if(dataChannel.readyState === "open")
					{
						dataChannel.send(JSON.stringify({
							id: null,
							jsonrpc: "2.0",
							error: {
								message: "JSONRPC.Server not initialized on this RTCDataChannel. Raw request: " + strMessage + ".",
								code: JSONRPC.Exception.PARSE_ERROR
							}
						}, undefined, "\t"));
					}

					throw new Error("JSONRPC.Server not initialized on this RTCDataChannel.");
				}


				const incomingRequest = new JSONRPC.IncomingRequest();

				incomingRequest.connectionID = nConnectionID;
				incomingRequest.router = this;


				try
				{
					const strEndpointPath = this._objSessions[nConnectionID].strEndpointPath;

					if(!this._jsonrpcServer.endpoints.hasOwnProperty(strEndpointPath))
					{
						throw new JSONRPC.Exception("Unknown JSONRPC endpoint " + strEndpointPath + ".", JSONRPC.Exception.METHOD_NOT_FOUND);
					}

					incomingRequest.endpoint = this._jsonrpcServer.endpoints[strEndpointPath];

					incomingRequest.requestBody = strMessage;
					incomingRequest.requestObject = objMessage;
				}
				catch(error)
				{
					incomingRequest.callResult = error;
				}


				await this._jsonrpcServer.processRequest(incomingRequest);
				
				if(dataChannel.readyState !== "open")
				{
					console.error("dataChannel.readyState: " + JSON.stringify(dataChannel.readyState) + ". Request was " + strMessage + ". Attempted responding with " + JSON.stringify(incomingRequest.callResultToBeSerialized, undefined, "\t") + ".");
				}

				dataChannel.send(incomingRequest.callResultSerialized);
			}
			else if(objMessage.hasOwnProperty("result") || objMessage.hasOwnProperty("error"))
			{
				if(
					this._objSessions.hasOwnProperty(nConnectionID)
					&& this._objSessions[nConnectionID].clientWebRTCTransportPlugin === null
				)
				{
					if(!this._jsonrpcServer)
					{
						if(dataChannel.readyState === "open")
						{
							dataChannel.send(JSON.stringify({
								id: null,
								jsonrpc: "2.0",
								error: {
									message: "JSONRPC.Client not initialized on this RTCConnection. Raw message: " + strMessage + ".",
									code: JSONRPC.Exception.PARSE_ERROR
								}
							}, undefined, "\t"));
						}
					}

					if(dataChannel.readyState === "open")
					{
						dataChannel.close();
					}

					throw new Error("How can the client be not initialized, and yet getting responses from phantom requests?");
				}
				
				if(this._objSessions.hasOwnProperty(nConnectionID))
				{
					await this._objSessions[nConnectionID].clientWebRTCTransportPlugin.processResponse(strMessage, objMessage);
				}
				else
				{
					console.error("Connection ID " + nConnectionID + " is closed and session is missing. Ignoring response: " + strMessage);
				}
			}
			else
			{
				throw new Error("Unable to qualify the message as a JSONRPC request or response.");
			}
		}
		catch(error)
		{
			console.error(error);
			console.error("Uncaught error. RAW remote message: " + strMessage);

			if(
				this._jsonrpcServer 
				&& this._objSessions.hasOwnProperty(nConnectionID)
				&& this._objSessions[nConnectionID].clientWebRTCTransportPlugin === null
			)
			{
				if(dataChannel.readyState === "open")
				{
					dataChannel.send(JSON.stringify({
						id: null,
						jsonrpc: "2.0",
						error: {
							message: "Internal error: " + error.message + ".",
							code: JSONRPC.Exception.INTERNAL_ERROR
						}
					}, undefined, "\t"));
				}
			}

			if(dataChannel.readyState === "open")
			{
				console.log("[" + process.pid + "] Unclean state. Closing data channel.");
				dataChannel.close();
			}

			return;
		}
	}
};
