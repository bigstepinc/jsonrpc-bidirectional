const JSONRPC = {};
JSONRPC.ClientPluginBase = require("../../ClientPluginBase");
JSONRPC.Utils = require("../../Utils");

const assert = require("assert");

module.exports =
/**
 *  this.rejectAllPromises(error) has to be called manually in a browser environment when a Worker is terminated or has finished working.
 */
class WorkerTransport extends JSONRPC.ClientPluginBase
{
	/**
	 * @param {Worker} worker
	 * @param {boolean|undefined} bBidirectionalWorkerMode
	 */
	constructor(worker, bBidirectionalWorkerMode)
	{
		super();
		

		// JSONRPC call ID as key, {promise: {Promise}, fnResolve: {Function}, fnReject: {Function}, outgoingRequest: {OutgoingRequest}} as values.
		this._objWorkerRequestsPromises = {};


		this._bBidirectionalWorkerMode = !!bBidirectionalWorkerMode;
		this._worker = worker;

		
		this._setupWorker();
	}


	/**
	 * @returns {Worker} 
	 */
	get worker()
	{
		return this._worker;
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
			|| !this._objWorkerRequestsPromises[objResponse.id]
		)
		{
			console.error(new Error("Couldn't find JSONRPC response call ID in this._objWorkerRequestsPromises. RAW response: " + JSON.stringify(objResponse)));
			console.error(new Error("RAW remote message: " + JSON.stringify(objResponse)));
			console.log("[" + process.pid + "] Unclean state. Unable to match Worker message to an existing Promise or qualify it as a request.");
			
			if(this.worker.terminate)
			{
				this.worker.terminate();
			}
			else if(this.worker !== process)
			{
				this.worker.kill();
			}

			return;
		}

		this._objWorkerRequestsPromises[objResponse.id].outgoingRequest.responseBody = objResponse;
		this._objWorkerRequestsPromises[objResponse.id].outgoingRequest.responseObject = objResponse;

		this._objWorkerRequestsPromises[objResponse.id].fnResolve(null);
		// Sorrounding code will parse the result and throw if necessary. fnReject is not going to be used in this function.

		delete this._objWorkerRequestsPromises[objResponse.id];
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

		if(this.worker.isDead && this.worker.isDead())
		{
			throw new Error("Worker not connected.");
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
			
			this._objWorkerRequestsPromises[outgoingRequest.requestObject.id] = {
				// unixtimeMilliseconds: (new Date()).getTime(),
				outgoingRequest: outgoingRequest,
				promise: null
			};

			this._objWorkerRequestsPromises[outgoingRequest.requestObject.id].promise = new Promise((fnResolve, fnReject) => {
				this._objWorkerRequestsPromises[outgoingRequest.requestObject.id].fnResolve = fnResolve;
				this._objWorkerRequestsPromises[outgoingRequest.requestObject.id].fnReject = fnReject;
			});
		}


		if(this.worker.postMessage)
		{
			this.worker.postMessage(outgoingRequest.requestObject);
		}
		else
		{
			this.worker.send(outgoingRequest.requestObject);
		}


		if(outgoingRequest.isNotification)
		{
			// JSONRPC 2.0 notification requests don't have the id property at all, not even null. JSONRPC 2.0 servers do not send a response at all for these types of requests.
		}
		else
		{
			return this._objWorkerRequestsPromises[outgoingRequest.requestObject.id].promise;
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
		console.log("[" + process.pid + "] Rejecting all Promise instances in WorkerTransport.");

		let nCount = 0;

		for(let nCallID in this._objWorkerRequestsPromises)
		{
			this._objWorkerRequestsPromises[nCallID].fnReject(error);
			delete this._objWorkerRequestsPromises[nCallID];

			nCount++;
		}

		if(nCount)
		{
			console.error("[" + process.pid + "] Rejected " + nCount + " Promise instances in WorkerTransport.");
		}
	}


	/**
	 * @protected
	 */
	_setupWorker()
	{
		if(this._worker.addEventListener)
		{
			// There's no close/exit event in browser environments.
			// Call this manually when appropriate: this.rejectAllPromises(new Error("Worker closed"));

			// TODO: create API to be called to remove event listeners.

			const fnOnError = (error) => {
				this.rejectAllPromises(error);
			};
			const fnOnMessage = async (messageEvent) => {
				await this.processResponse(messageEvent.data);
			};

			this._worker.addEventListener("error", fnOnError);

			if(!this._bBidirectionalWorkerMode)
			{
				this._worker.addEventListener("message", fnOnMessage);
			}
		}
		else
		{
			const fnOnError = (error) => {
				this.rejectAllPromises(error);
			};
			const fnOnMessage = async (objMessage) => {
				await this.processResponse(objMessage);
			};
			const fnOnExit = (nCode, nSignal) => {
				this.rejectAllPromises(new Error("Worker closed. Code: " + JSON.stringify(nCode) + ". Signal: " + JSON.stringify(nSignal)));

				this._worker.removeListener("exit", fnOnExit);
				this._worker.removeListener("error", fnOnError);
	
				if(!this._bBidirectionalWorkerMode)
				{
					this._worker.removeListener("message", fnOnMessage);
				}
			};

			this._worker.on("exit", fnOnExit);
			this._worker.on("error", fnOnError);

			if(!this._bBidirectionalWorkerMode)
			{
				this._worker.on("message", fnOnMessage);
			}
		}
	}
};
