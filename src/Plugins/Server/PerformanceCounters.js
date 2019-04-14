const JSONRPC = {};
JSONRPC.ServerPluginBase = require("../../ServerPluginBase");

module.exports =
class PerformanceCounters extends JSONRPC.ServerPluginBase
{
	/**
	 * The  bExportMethodOnEndpoint, bFakeAuthenticatedExportedMethod and bFakeAuthorizedExportedMethod may be used for convenience.
	 * Be careful, as sometimes what functions were called and their performance metrics may be of interest to an attacker.
	 * 
	 * If bExportMethodOnEndpoint is true, then a method named "rpc.performanceCounters" with no params 
	 * is exported on any endpoint of the Server which added this plugin.
	 * 
	 * bFakeAuthenticatedExportedMethod will set the IncomingRequest.isAuthenticated property from thus plugin directly.
	 * bFakeAuthorizedExportedMethod will set the IncomingRequest.isAuthenticated property from thus plugin directly.
	 * 
	 * @param {boolean} bExportMethodOnEndpoint = false
	 * @param {boolean} bFakeAuthenticatedExportedMethod = false
	 * @param {boolean} bFakeAuthorizedExportedMethod = false
	 */
	constructor(bExportMethodOnEndpoint = false, bFakeAuthenticatedExportedMethod = false, bFakeAuthorizedExportedMethod = false)
	{
		super();

		this._mapFunctioNameToMetrics = new Map();
		this._nCurrentlyRunningFunctions = 0;

		this._bExportMethodOnEndpoint = bExportMethodOnEndpoint;
		this._bFakeAuthenticatedExportedMethod = bFakeAuthenticatedExportedMethod;
		this._bFakeAuthorizedExportedMethod = bFakeAuthorizedExportedMethod;
	}


	/**
	 * @param {JSONRPC.IncomingRequest} incomingRequest
	 */
	async afterJSONDecode(incomingRequest)
	{
		if(this._bFakeAuthenticatedExportedMethod)
		{
			incomingRequest.isAuthenticated = true;
		}

		if(this._bFakeAuthorizedExportedMethod)
		{
			incomingRequest.isAuthorized = true;
		}
		

		incomingRequest.startDurationTimer();

		if(incomingRequest.requestObject.method && !incomingRequest.isNotification)
		{
			this._nCurrentlyRunningFunctions++;
		}
	}


	/**
	 * @override
	 * 
	 * This is called after a function has been called successfully.
	 * 
	 * @param {JSONRPC.IncomingRequest} incomingRequest
	 */
	async result(incomingRequest)
	{
		if(!incomingRequest.isNotification)
		{
			this._nCurrentlyRunningFunctions--;
			
			if(this._nCurrentlyRunningFunctions < 0)
			{
				this._nCurrentlyRunningFunctions = 0;
			}
		}

		const objMetrics = this._functionMappings(incomingRequest.requestObject.method);

		objMetrics.successCount += 1;
		objMetrics.successMillisecondsTotal += incomingRequest.durationMilliseconds;
		objMetrics.successMillisecondsAverage = parseInt(objMetrics.successMillisecondsTotal / objMetrics.successCount);
	}


	/**
	 * @override
	 * 
	 * This is called if a function was not called successfully.
	 * 
	 * @param {JSONRPC.IncomingRequest} incomingRequest
	 */
	async exceptionCatch(incomingRequest)
	{
		if(incomingRequest.requestObject && incomingRequest.requestObject.method)
		{
			if(!incomingRequest.isNotification)
			{
				this._nCurrentlyRunningFunctions--;

				if(this._nCurrentlyRunningFunctions < 0)
				{
					this._nCurrentlyRunningFunctions = 0;
				}
			}

			const objMetrics = this._functionMappings(incomingRequest.requestObject.method);

			objMetrics.errorCount += 1;
			objMetrics.errorMillisecondsTotal += incomingRequest.durationMilliseconds;
			objMetrics.errorMillisecondsAverage = parseInt(objMetrics.errorMillisecondsTotal / objMetrics.errorCount);
		}
	}


	/**
	 * If a plugin chooses to actually make the call here, 
	 * it must set the result in the incomingRequest.callResult property.
	 * 
	 * @param {JSONRPC.IncomingRequest} incomingRequest
	 */
	async callFunction(incomingRequest)
	{
		// Useful here:
		// incomingRequest.requestObject.method
		// incomingRequest.requestObject.params

		// incomingRequest.callResult may be populated here with an Error class instance, or the function return.

		if(
			incomingRequest.requestObject 
			&& incomingRequest.requestObject.method
			
			&& this._bExportMethodOnEndpoint
		)
		{
			if(incomingRequest.requestObject.method === "rpc.performanceCounters")
			{
				incomingRequest.callResult = {
					metrics: this.metricsAsObject,
					runningCallsCount: this.runningCallsCount
				};
			}
			else if(incomingRequest.requestObject.method === "rpc.performanceCountersClear")
			{
				incomingRequest.callResult = true;
				this._mapFunctioNameToMetrics.clear();
			}
		}
	}

	
	/**
	 * @returns {Map<functionName:string, metrics:{successCount: number, errorCount: number, successMillisecondsTotal: number, errorMillisecondsTotal: number, successMillisecondsAverage: number, errorMillisecondsAverage: number}>}
	 */
	get metrics()
	{
		return this._mapFunctioNameToMetrics;
	}


	/**
	 * @returns {Object<functionName:string, metrics:{successCount: number, errorCount: number, successMillisecondsTotal: number, errorMillisecondsTotal: number, successMillisecondsAverage: number, errorMillisecondsAverage: number}>}
	 */
	get metricsAsObject()
	{
		const objMetrics = {};

		for(const strFunctionName of this._mapFunctioNameToMetrics.keys())
		{
			objMetrics[strFunctionName] = this._mapFunctioNameToMetrics.get(strFunctionName);
		}

		return objMetrics;
	}


	/**
	 * @returns {number}
	 */
	get runningCallsCount()
	{
		return this._nCurrentlyRunningFunctions;
	}


	/**
	 * @protected
	 * 
	 * @param {string} strFunctionName 
	 * 
	 * @returns {undefined}
	 */
	_functionMappings(strFunctionName)
	{
		let objMetrics = this._mapFunctioNameToMetrics.get(strFunctionName);

		if(!objMetrics)
		{
			objMetrics = {
				successCount: 0,
				errorCount: 0,

				successMillisecondsTotal: 0,
				errorMillisecondsTotal: 0,

				successMillisecondsAverage: 0,
				errorMillisecondsAverage: 0
			};
			
			this._mapFunctioNameToMetrics.set(strFunctionName, objMetrics);
		}

		return objMetrics;
	}
};
