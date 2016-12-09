const assert = require("assert");
const JSONRPC = require("../../../index").JSONRPC;

module.export =
class WebSocketBidirectionalRouter
{
	/**
	 * If both the client and server plugins are specified, bi-directional JSONRPC over the same websocket is enabled.
	 * 
	 * @param {JSONRPC.Plugins.Client.WebSocketTransport|null} webSocketTransportClient
	 * @param {JSONRPC.Server|null} jsonrpcServer
	 */
	construct(webSocketTransportClient, jsonrpcServer)
	{
		assert(webSocketTransportClient === null || webSocketTransportClient instanceof JSONRPC.Plugins.Client.WebSocketTransport);
		assert(jsonrpcServer === null || jsonrpcServer instanceof JSONRPC.Server);

		this._webSocketTransportClient = webSocketTransportClient;
		this._jsonrpcServer = jsonrpcServer;
	}


	/**
	 * Routes websocket messages to either the client or the server websocket plugin.
	 *  
	 * @param {string} strMessage
	 * @param {WebSocket} webSocket
	 */
	async routeMessage(strMessage, webSocket)
	{
		let objMessage;

		try
		{
			objMessage = JSON.parse(strMessage);
		}
		catch(error)
		{
			console.error(error);
			console.error("Unable to parse JSON. RAW remote message: " + strMessage);

			if(this._jsonrpcServer && !this._webSocketTransportClient)
			{
				webSocket.send(JSON.stringify({
					id: null,
					jsonrpc: "2.0",
					error: {
						message: "Invalid JSON: " + JSON.stringify(strMessage) + ".",
						code: JSONRPC.Exception.PARSE_ERROR
					}
				}, undefined, "\t"));
			}

			console.log("Unclean state. Unable to match WebSocket message to an existing Promise or qualify it as a request or response.");
			webSocket.close(1, "Unclean state. Unable to match WebSocket message to an existing Promise or qualify it as a request or response.");

			return;
		}

		if(objMessage.hasOwnProperty("method") && this._jsonrpcServer)
		{
			const jsonrpcRequest = new JSONRPC.IncomingRequest();


			// Move this somewhere in a state tracking class instance of the websocket connection so it is only executed on an incoming connection,
			// for efficiency.
			try
			{
				const strPath = JSONRPC.EndpointBase.normalizePath(webSocket.address);

				if(!this._objEndpoints.hasOwnProperty(strPath))
				{
					throw new JSONRPC.Exception("Unknown JSONRPC endpoint " + strPath + ".", JSONRPC.Exception.METHOD_NOT_FOUND);
				}
				jsonrpcRequest.endpoint = this._objEndpoints[strPath];


				jsonrpcRequest.requestBody = strMessage;
				jsonrpcRequest.requestObject = objMessage;
			}
			catch(error)
			{
				jsonrpcRequest.callResult = error;
			}


			const objResponse = await this._jsonrpcServer.processRequest(jsonrpcRequest);
			webSocket.send(JSON.stringify(objResponse));
		}
		else
		{
			await this._webSocketTransportClient.processResponse(strMessage, objMessage);
		}
	}
};
