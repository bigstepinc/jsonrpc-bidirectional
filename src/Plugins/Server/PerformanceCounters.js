const JSONRPC = {};
JSONRPC.ServerPluginBase = require("../../ServerPluginBase");

module.exports =
class PerformanceCounters extends JSONRPC.ServerPluginBase
{
	constructor()
	{
		super();

		this._mapFunctioNameToMetrics = new Map();
		this._nCurrentlyRunningFunctions = 0;
	}


	/**
	 * @param {JSONRPC.IncomingRequest} incomingRequest
	 */
	async afterJSONDecode(incomingRequest)
	{
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
			}

			const objMetrics = this._functionMappings(incomingRequest.requestObject.method);

			objMetrics.errorCount += 1;
			objMetrics.errorMillisecondsTotal += incomingRequest.durationMilliseconds;
			objMetrics.errorMillisecondsAverage = parseInt(objMetrics.errorMillisecondsTotal / objMetrics.errorCount);
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
