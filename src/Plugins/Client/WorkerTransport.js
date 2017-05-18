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
			typeof objResponse.id !== "number"
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

		assert(typeof outgoingRequest.requestObject.id === "number", "outgoingRequest.requestObject.id must be of type number.");
		
		this._objWorkerRequestsPromises[outgoingRequest.requestObject.id] = {
			// unixtimeMilliseconds: (new Date()).getTime(),
			outgoingRequest: outgoingRequest,
			promise: null
		};

		this._objWorkerRequestsPromises[outgoingRequest.requestObject.id].promise = new Promise((fnResolve, fnReject) => {
			this._objWorkerRequestsPromises[outgoingRequest.requestObject.id].fnResolve = fnResolve;
			this._objWorkerRequestsPromises[outgoingRequest.requestObject.id].fnReject = fnReject;
		});

		if(this.worker.postMessage)
		{
			this.worker.postMessage(outgoingRequest.requestObject);
		}
		else
		{
			this.worker.send(outgoingRequest.requestObject);
		}

		return this._objWorkerRequestsPromises[outgoingRequest.requestObject.id].promise;
	}


	/**
	 * @param {JSONRPC.OutgoingRequest} outgoingRequest
	 */
	async beforeJSONDecode(outgoingRequest)
	{
		outgoingRequest.responseObject = outgoingRequest.responseBody;
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

			this._worker.addEventListener(
				"error",
				(error) => {
					this.rejectAllPromises(error);
				}
			);

			if(!this._bBidirectionalWorkerMode)
			{
				this._worker.addEventListener(
					"message",
					async (messageEvent) => {
						await this.processResponse(messageEvent.data);
					}
				);
			}
		}
		else
		{
			this._worker.on(
				"exit",
				(nCode, nSignal) => {
					this.rejectAllPromises(new Error("Worker closed. Code: " + JSON.stringify(nCode) + ". Signal: " + JSON.stringify(nSignal)));
				}
			);
			
			this._worker.on(
				"error",
				(error) => {
					this.rejectAllPromises(error);
				}
			);

			if(!this._bBidirectionalWorkerMode)
			{
				this._worker.on(
					"message",
					async (objMessage) => {
						await this.processResponse(objMessage);
					}
				);
			}
		}
	}
};
