const JSONRPC = {};
JSONRPC.ClientPluginBase = require("../../ClientPluginBase");
JSONRPC.Utils = require("../../Utils");

const assert = require("assert");

let Threads;
try
{
	Threads = require("worker_threads");
}
catch(error)
{
	// console.error(error);
}

class WorkerThreadTransport extends JSONRPC.ClientPluginBase
{
	/**
	 * @param {worker_threads.Worker|Threads} threadWorker
	 * @param {boolean|undefined} bBidirectionalMode
	 */
	constructor(threadWorker, bBidirectionalMode)
	{
		super();


		assert(threadWorker instanceof Threads.Worker || threadWorker === Threads);
		

		// JSONRPC call ID as key, {promise: {Promise}, fnResolve: {Function}, fnReject: {Function}, outgoingRequest: {OutgoingRequest}} as values.
		this._objWorkerRequestsPromises = {};


		this._bBidirectionalMode = !!bBidirectionalMode;
		this._threadWorker = threadWorker;
		this._threadID = threadWorker.threadId;

		
		this._setupThreadWorker();
	}


	/**
	 * @returns {worker_threads.Worker|worker_threads}
	 */
	get threadWorker()
	{
		return this._threadWorker;
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
			console.error(new Error(`Couldn't find JSONRPC response call ID in this._objWorkerRequestsPromises from thread ID ${this._threadID}. RAW response: ${JSON.stringify(objResponse)}`));
			console.error(new Error(`RAW remote message from thread ID ${this._threadID}: ` + JSON.stringify(objResponse)));
			console.log(`Unclean state in WorkerThreadTransport. Unable to match message from thread Worker thread ID ${this._threadID} to an existing Promise or qualify it as a request.`);
			
			if(Threads.isMainThread)
			{
				this.threadWorker.terminate();
			}
			else
			{
				process.exit(1);
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
		
		if(Threads.isMainThread)
		{
			this.threadWorker.postMessage(outgoingRequest.requestObject, outgoingRequest.transferList);
		}
		else
		{
			Threads.parentPort.postMessage(outgoingRequest.requestObject, outgoingRequest.transferList);
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
		console.log(`Rejecting all Promise instances for WorkerThreadTransport thread Id ${this._threadID}.`);

		let nCount = 0;

		for(let nCallID in this._objWorkerRequestsPromises)
		{
			this._objWorkerRequestsPromises[nCallID].fnReject(error);
			delete this._objWorkerRequestsPromises[nCallID];

			nCount++;
		}

		if(nCount)
		{
			console.error(`Rejected ${nCount} Promise instances for WorkerThreadTransport thread Id ${this._threadID}`);
		}
	}


	/**
	 * @protected
	 */
	_setupThreadWorker()
	{
		const fnOnError = (error) => {
			this.rejectAllPromises(error);
		};
		const fnOnClose = () => {
			this.rejectAllPromises(new Error("Thread MessagePort closed."));
		};
		const fnOnMessage = async (objMessage) => {
			await this.processResponse(objMessage);
		};
		const fnOnExit = (nCode) => {
			this.rejectAllPromises(new Error(`Thread Worker with thread ID ${this._threadID} closed. Code: ${JSON.stringify(nCode)}`));

			if(Threads.isMainThread)
			{
				this._threadWorker.removeListener("exit", fnOnExit);
				this._threadWorker.removeListener("error", fnOnError);

				if(!this._bBidirectionalMode)
				{
					this._threadWorker.removeListener("message", fnOnMessage);
				}
			}
			else
			{
				Threads.parentPort.removeListener("close", fnOnClose);

				if(!this._bBidirectionalMode)
				{
					Threads.parentPort.removeListener("message", fnOnMessage);
				}
			}
		};

		if(Threads.isMainThread)
		{
			this._threadWorker.on("exit", fnOnExit);
			this._threadWorker.on("error", fnOnError);

			if(!this._bBidirectionalMode)
			{
				this._threadWorker.on("message", fnOnMessage);
			}
		}
		else
		{
			Threads.parentPort.on("close", fnOnClose);

			if(!this._bBidirectionalMode)
			{
				Threads.parentPort.on("message", fnOnMessage);
			}
		}
	}
};

module.exports = WorkerThreadTransport;
