const assert = require("assert");

let electron = require("electron");

// Browser environment
if(!electron && typeof (window || self).require === "function")
{
	electron = (window || self).require("electron");
}

const JSONRPC = {};
JSONRPC.Exception = require("./Exception");
JSONRPC.Server = require("./Server");
JSONRPC.Client = require("./Client");
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
class BidirectionalElectronIPCRouter extends JSONRPC.RouterBase
{
	/**
	 * @override
	 * 
	 * @param {JSONRPC.Server|null} jsonrpcServer
	 */
	constructor(jsonrpcServer)
	{
		super(jsonrpcServer);

		jsonrpcServer.on(
			"response",
			(incomingRequest) => {
				// No serialization.
				incomingRequest.callResultSerialized = incomingRequest.callResultToBeSerialized;
			}
		);

		this._objWaitForBrowserWindowReadyPromises = {};
	}


	/**
	 * This method is to be used in the main process.
	 * 
	 * @param {BrowserWindow} browserWindow 
	 * @param {string|null} strEndpointPath = null
	 * @param {number} nElectronIPCReadyTimeoutMilliseconds = 60000
	 */
	async addBrowserWindow(browserWindow, strEndpointPath = null, nElectronIPCReadyTimeoutMilliseconds = 60000)
	{
		if(strEndpointPath !== null)
		{
			strEndpointPath = JSONRPC.EndpointBase.normalizePath(strEndpointPath);
		}

		const nConnectionID = ++this._nConnectionIDCounter;

		this._objWaitForBrowserWindowReadyPromises[nConnectionID] = {
			fnResolve: null, 
			fnReject: null
		};

		let promiseWaitForElectronIPCReady = new Promise((fnResolve, fnReject) => {
			this._objWaitForBrowserWindowReadyPromises[nConnectionID].fnResolve = fnResolve;
			this._objWaitForBrowserWindowReadyPromises[nConnectionID].fnReject = fnReject;
		});

		const strChannel = "jsonrpc_winid_" + browserWindow.id;

		const objSession = {
			browserWindow: browserWindow,
			nConnectionID: nConnectionID,
			clientReverseCalls: null,
			clientElectronIPCTransportPlugin: null,
			strEndpointPath: strEndpointPath,
			strChannel: strChannel
		};

		this._objSessions[nConnectionID] = objSession;

		electron.ipcMain.on(
			strChannel, 
			async (event, objJSONRPCRequest) => {
				if(objJSONRPCRequest.method === "rpc.connectToEndpoint")
				{
					return this._onRPCConnectToEndpoint(objJSONRPCRequest, nConnectionID, strChannel);
				}

				await this._routeMessage(objJSONRPCRequest, objSession, strChannel);
			}
		);

		browserWindow.on(
			"closed",
			() => {
				this.onConnectionEnded(nConnectionID);
			}
		);

		const nTimeoutWaitForBrowserWindowReady = setTimeout(
			(event) => {
				this._objWaitForBrowserWindowReadyPromises[nConnectionID].fnReject(new Error("Timed out waiting for BrowserWindow to be ready for JSONRPC."));
			},
			nElectronIPCReadyTimeoutMilliseconds
		);
		await promiseWaitForElectronIPCReady;
		clearTimeout(nTimeoutWaitForBrowserWindowReady);


		return nConnectionID;
	}

	
	/**
	 * To be used inside BrowserWindow instances.
	 * 
	 * Must be called ONLY AFTER the JSONRPC server is configured and all endpoints and plugins have been added.
	 * Otherwise the main process might make calls in a race condition with adding plugins and endpoints.
	 * 
	 * @param {string} strEndpointPath
	 * 
	 * @returns {number}
	 */
	async addMainProcess(strEndpointPath)
	{
		strEndpointPath = JSONRPC.EndpointBase.normalizePath(strEndpointPath);

		const nConnectionID = ++this._nConnectionIDCounter;

		const strChannel = "jsonrpc_winid_" + electron.remote.getCurrentWindow().id;

		const objSession = {
			browserWindow: null,
			nConnectionID: nConnectionID,
			clientReverseCalls: null,
			clientElectronIPCTransportPlugin: null,
			strEndpointPath: strEndpointPath,
			strChannel: strChannel
		};

		this._objSessions[nConnectionID] = objSession;

		electron.ipcRenderer.on(
			strChannel, 
			async (event, objJSONRPCRequest) => {
				await this._routeMessage(objJSONRPCRequest, objSession, strChannel);
			}
		);

		const client = this._makeReverseCallsClient(JSONRPC.Client, objSession);
		await client.rpc("rpc.connectToEndpoint", [strEndpointPath]);

		return nConnectionID;
	}


	/**
	 * @param {Object} objJSONRPCRequest 
	 * @param {number} nConnectionID
	 * @param {string} strChannel
	 */
	_onRPCConnectToEndpoint(objJSONRPCRequest, nConnectionID, strChannel)
	{
		const strEndpointPath = objJSONRPCRequest.params[0];
		assert(typeof nConnectionID === "number", "nConnectionID must be of type number.");

		if(!this._objSessions.hasOwnProperty(nConnectionID))
		{
			console.error(new Error(`[rpc.connectToEndpoint] BrowserWindow with connection ID ${nConnectionID} doesn't exist. Maybe it was closed.`));
			return;
		}

		try
		{
			assert(typeof strEndpointPath === "string", "strEndpointPath must be of type string.");

			this._objSessions[nConnectionID].strEndpointPath = JSONRPC.EndpointBase.normalizePath(strEndpointPath);
			this._objWaitForBrowserWindowReadyPromises[nConnectionID].fnResolve(this._objSessions[nConnectionID].strEndpointPath);
			const browserWindow = this._objSessions[nConnectionID].browserWindow;
			
			const objResponse = {
				id: objJSONRPCRequest.id,
				result: null,
				jsonrpc: "2.0"
			};

			browserWindow.webContents.send(strChannel, objResponse);
		}
		catch(error)
		{
			const browserWindow = this._objSessions[nConnectionID].browserWindow;

			const objResponse = {
				id: objJSONRPCRequest.id,
				error: {
					message: error.message + "\n" + error.stack, 
					code: 0
				},
				jsonrpc: "2.0"
			};
			
			browserWindow.webContents.send(strChannel, objResponse);

			this._objWaitForBrowserWindowReadyPromises[nConnectionID].fnReject(error);
		}
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
		
		objSession.clientElectronIPCTransportPlugin = new JSONRPC.Plugins.Client.ElectronIPCTransport(/*bBidirectionalMode*/ true, objSession.browserWindow, objSession.strChannel);
		clientReverseCalls.addPlugin(objSession.clientElectronIPCTransportPlugin);

		this.emit("madeReverseCallsClient", clientReverseCalls);

		return clientReverseCalls;
	}


	/**
	 * Routes messages to either the client or the server plugin.
	 * 
	 * @param {Object} objMessage
	 * @param {Object} objSession
	 * @param {string} strChannel
	 */
	async _routeMessage(objMessage, objSession, strChannel)
	{
		const browserWindow = objSession.browserWindow;
		const nConnectionID = objSession.nConnectionID;

		if(typeof objMessage !== "object")
		{
			console.error("[" + process.pid + "] BidirectionalElectronIPC: Received " + (typeof objMessage) + " instead of object. Ignoring. RAW message: " + JSON.stringify(objMessage));
			return;
		}

		let bNotification = !objMessage.hasOwnProperty("id");

		try
		{
			if(objMessage.hasOwnProperty("method"))
			{
				if(!this._jsonrpcServer)
				{
					throw new Error("JSONRPC.Server not initialized.");
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

					incomingRequest.requestBody = objMessage;
					incomingRequest.requestObject = objMessage;
				}
				catch(error)
				{
					incomingRequest.callResult = error;
				}


				await this._jsonrpcServer.processRequest(incomingRequest);


				if(!bNotification)
				{
					if(browserWindow)
					{
						browserWindow.webContents.send(strChannel, incomingRequest.callResultToBeSerialized);
					}
					else
					{
						electron.ipcRenderer.send(strChannel, incomingRequest.callResultToBeSerialized)
					}
				}
			}
			else if(objMessage.hasOwnProperty("result") || objMessage.hasOwnProperty("error"))
			{
				if(
					this._objSessions.hasOwnProperty(nConnectionID)
					&& this._objSessions[nConnectionID].clientElectronIPCTransportPlugin === null
				)
				{
					throw new Error("How can the client be not initialized, and yet getting responses from phantom requests?");
				}
				
				if(this._objSessions.hasOwnProperty(nConnectionID))
				{
					await this._objSessions[nConnectionID].clientElectronIPCTransportPlugin.processResponse(objMessage);
				}
				else
				{
					console.error("Connection ID " + nConnectionID + " is closed and session is missing. Ignoring response: " + JSON.stringify(objMessage));
				}
			}
			else
			{
				// Malformed message, will attempt to send a response.
				bNotification = false;

				throw new Error("Unable to qualify the message as a JSONRPC request or response.");
			}
		}
		catch(error)
		{
			console.error(error);
			console.error("Uncaught error. RAW remote message: " + JSON.stringify(objMessage));

			console.error("[" + process.pid + "] Unclean state.");
			
			this.onConnectionEnded(nConnectionID);
		}
	}


	/**
	 * @param {number} nConnectionID 
	 */
	onConnectionEnded(nConnectionID)
	{
		super.onConnectionEnded(nConnectionID);

		delete this._objWaitForBrowserWindowReadyPromises[nConnectionID];
	}
};
