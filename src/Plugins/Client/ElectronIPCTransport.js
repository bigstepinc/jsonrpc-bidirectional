let electron = null;

if(process && process.versions["electron"])
{
	/* eslint-disable*/ 
	electron = require("electron");

	// Browser environment
	if((window || self) && !electron && typeof (window || self).require === "function")
	{
		electron = (window || self).require("electron");
	}
	/* eslint-enable*/ 
}

const JSONRPC = {};
JSONRPC.ClientPluginBase = require("../../ClientPluginBase");
JSONRPC.Utils = require("../../Utils");

const assert = require("assert");

module.exports =
/**
 *  this.rejectAllPromises(error) has to be called manually in a browser environment when a BrowserWindow is terminated or has finished working.
 */
class ElectronIPCTransport extends JSONRPC.ClientPluginBase
{
	/**
	 * browserWindow is ignored inside a BrowserWindow instance. Should only be set inside the master process.
	 * 
	 * @param {boolean|undefined} bBidirectionalMode
	 * @param {BrowserWindow|null} browserWindow = null
	 */
	constructor(bBidirectionalMode, browserWindow)
	{
		super();
		

		// JSONRPC call ID as key, {promise: {Promise}, fnResolve: {Function}, fnReject: {Function}, outgoingRequest: {OutgoingRequest}} as values.
		this._objBrowserWindowRequestsPromises = {};


		this._bBidirectionalMode = !!bBidirectionalMode;
		this._browserWindow = browserWindow;
		
		this._strChannel = "jsonrpc_winid_" + (browserWindow ? browserWindow.id : electron.remote.getCurrentWindow().id);
		
		this._setupIPCTransport();
	}


	/**
	 * @returns {BrowserWindow|null} 
	 */
	get browserWindow()
	{
		return this._browserWindow;
	}
	

	get channel()
	{
		return this._strChannel;
	}


	/**
	 * @param {JSONRPC.OutgoingRequest} outgoingRequest
	 */
	async beforeJSONEncode(outgoingRequest)
	{
		// No serialization.
		outgoingRequest.requestBody = outgoingRequest.requestObject;
	}


	/**
	 * objResponse is the object obtained after JSON parsing for strResponse.
	 * 
	 * @param {Object|undefined} objResponse
	 */
	async processResponse(objResponse)
	{
		if(
			(
				typeof objResponse.id !== "number"
				&& typeof objResponse.id !== "string"
			)
			|| !this._objBrowserWindowRequestsPromises[objResponse.id]
		)
		{
			console.error(new Error("Couldn't find JSONRPC response call ID in this._objWorkerRequestsPromises. RAW response: " + JSON.stringify(objResponse)));
			console.error(new Error("RAW remote message: " + JSON.stringify(objResponse)));
			console.error("[" + process.pid + "] Unclean state. Unable to match message to an existing Promise or qualify it as a request.");
			
			return;
		}

		this._objBrowserWindowRequestsPromises[objResponse.id].outgoingRequest.responseBody = objResponse;
		this._objBrowserWindowRequestsPromises[objResponse.id].outgoingRequest.responseObject = objResponse;

		this._objBrowserWindowRequestsPromises[objResponse.id].fnResolve(null);
		// Sorrounding code will parse the result and throw if necessary. fnReject is not going to be used in this function.

		delete this._objBrowserWindowRequestsPromises[objResponse.id];
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
			
			this._objBrowserWindowRequestsPromises[outgoingRequest.requestObject.id] = {
				// unixtimeMilliseconds: (new Date()).getTime(),
				outgoingRequest: outgoingRequest,
				promise: null
			};

			this._objBrowserWindowRequestsPromises[outgoingRequest.requestObject.id].promise = new Promise((fnResolve, fnReject) => {
				this._objBrowserWindowRequestsPromises[outgoingRequest.requestObject.id].fnResolve = fnResolve;
				this._objBrowserWindowRequestsPromises[outgoingRequest.requestObject.id].fnReject = fnReject;
			});
		}


		if(this.browserWindow)
		{
			this.browserWindow.webContents.send(this.channel, outgoingRequest.requestObject);
		}
		else
		{
			electron.ipcRenderer.send(this.channel, outgoingRequest.requestObject);
		}


		if(outgoingRequest.isNotification)
		{
			// JSONRPC 2.0 notification requests don't have the id property at all, not even null. JSONRPC 2.0 servers do not send a response at all for these types of requests.
		}
		else
		{
			return this._objBrowserWindowRequestsPromises[outgoingRequest.requestObject.id].promise;
		}
	}


	/**
	 * @param {JSONRPC.OutgoingRequest} outgoingRequest
	 */
	async beforeJSONDecode(outgoingRequest)
	{
	}


	/**
	 * @param {Error} error
	 */
	rejectAllPromises(error)
	{
		//console.error(error);
		console.log("[" + process.pid + "] Rejecting all Promise instances in ElectronIPCTransport.");

		let nCount = 0;

		for(let nCallID in this._objBrowserWindowRequestsPromises)
		{
			this._objBrowserWindowRequestsPromises[nCallID].fnReject(error);
			delete this._objBrowserWindowRequestsPromises[nCallID];

			nCount++;
		}

		if(nCount)
		{
			console.error("[" + process.pid + "] Rejected " + nCount + " Promise instances in ElectronIPCTransport.");
		}
	}


	/**
	 * @protected
	 */
	_setupIPCTransport()
	{
		if(!this.browserWindow)
		{
			if(!this._bBidirectionalMode)
			{
				electron.ipcRenderer.on(
					this._strChannel, 
					async (event, objJSONRPCRequest) => {
						await this.processResponse(objJSONRPCRequest);
					}
				);
			}
		}
		else
		{
			this._browserWindow.on(
				"closed",
				() => {
					this.rejectAllPromises(new Error(`BrowserWindow ${this.browserWindow.id} closed`));
				}
			);
			
			if(!this._bBidirectionalMode)
			{
				electron.ipcMain.on(
					this.channel, 
					async (event, objJSONRPCRequest) => {
						await this.processResponse(objJSONRPCRequest);
					}
				);
			}
		}
	}
};
