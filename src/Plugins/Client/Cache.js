const JSONRPC = {};
JSONRPC.ClientPluginBase = require("../../ClientPluginBase");

module.exports =
class Cache extends JSONRPC.ClientPluginBase
{
	/**
	 * @param {Object} objFunctionNameToCacheSeconds . The keys are function names and the values are the number of seconds until the cached result expires. The values must be numbers greater than 0.
	 * @param {boolean} bDeepFreeze . If true, deep freeze the returned value using recursive Object.freeze.
	 * @param {boolean} bReturnDeepCopy . If true, return a deep copy of the cached value.
	 * @param {number} nMaxEntries . The maximum number of entries in the cache. When this limit is reached, clear the cache.
	 */
	constructor(objFunctionNameToCacheSeconds, bDeepFreeze = false, bReturnDeepCopy = false, nMaxEntries = 5000)
	{
		super();

		if(typeof objFunctionNameToCacheSeconds !== "object" || Array.isArray(objFunctionNameToCacheSeconds))
		{
			throw new Error("Invalid objFunctionNameToCacheSeconds parameter given.");
		}

		Object.entries(objFunctionNameToCacheSeconds).forEach(([strFunctionName, nCacheDurationSeconds]) => {
			if(nCacheDurationSeconds <= 0)
			{
				throw new Error(`Invalid cache duration ${nCacheDurationSeconds} given for function ${strFunctionName}. It must be a number of seconds greater than 0.`);
			}
		});

		this._mapFunctionNameToCacheSeconds = new Map(Object.entries(objFunctionNameToCacheSeconds));
		this._bDeepFreeze = bDeepFreeze;
		this._bReturnDeepCopy = bReturnDeepCopy;
		this._nMaxEntries = nMaxEntries;

		this.mapCache = new Map();
	}


	clear()
	{
		this.mapCache.clear();
	}


	/**
	 * If the function result is already cached and the cache hasn't yet expired, skip the HTTP request and use a JSONRPC response object with null result.
	 * It will be populated from the cache during the afterJSONDecode step.
	 * 
	 * @param {JSONRPC.OutgoingRequest} outgoingRequest
	 */
	async afterJSONEncode(outgoingRequest)
	{
		if(outgoingRequest.isNotification)
		{
			return;
		}

		if(this._mapFunctionNameToCacheSeconds.has(outgoingRequest.methodName))
		{
			const strKey = this.constructor._getCacheKey(outgoingRequest);

			if(
				(this.mapCache.has(strKey) && this.mapCache.size > this._nMaxEntries)
				|| (!this.mapCache.has(strKey) && this.mapCache.size >= this._nMaxEntries)
			)
			{
				this.clear();
			}

			if(this.mapCache.has(strKey))
			{
				if(this._isCacheEntryExpired(strKey))
				{
					this.mapCache.delete(strKey);
				}
				else
				{
					outgoingRequest.responseObject = {
						"jsonrpc": this.constructor.DEFAULT_JSONRPC_VERSION,
						"result": null,
						"id": outgoingRequest.callID
					};

					outgoingRequest.responseBody = JSON.stringify(outgoingRequest.responseObject, undefined, "\t");
					outgoingRequest.isMethodCalled = true;
				}
			}
		}
	}


	/**
	 * Store the responseObject in the cache if the coresponding entry is unset, or return it from the cache otherwise.
	 * 
	 * @param {JSONRPC.OutgoingRequest} outgoingRequest
	 */
	async afterJSONDecode(outgoingRequest)
	{
		if(outgoingRequest.isNotification)
		{
			return;
		}

		if(outgoingRequest.methodName && this._mapFunctionNameToCacheSeconds.has(outgoingRequest.methodName))
		{
			const strKey = this.constructor._getCacheKey(outgoingRequest);

			if(this.mapCache.has(strKey))
			{
				const cachedValue = this.mapCache.get(strKey).value;

				if(this._bReturnDeepCopy)
				{
					outgoingRequest.responseObject.result = this.constructor._deepCopy(cachedValue);

					if(this._bDeepFreeze)
					{
						this.constructor._deepFreeze(outgoingRequest.responseObject.result);
					}
				}
				else
				{
					outgoingRequest.responseObject.result = cachedValue;
				}
			}
			else
			{
				const nFunctionCacheDurationSeconds = this._mapFunctionNameToCacheSeconds.get(outgoingRequest.methodName);
				const nExpiresAtUnixTimestampMilliseconds = nFunctionCacheDurationSeconds * 1000 + Date.now();

				if(this._bDeepFreeze && !this._bReturnDeepCopy)
				{
					this.constructor._deepFreeze(outgoingRequest.responseObject.result);
					this.mapCache.set(strKey, {
						expiresAt: nExpiresAtUnixTimestampMilliseconds,
						value: outgoingRequest.responseObject.result
					});
				}
				else
				{
					const objectForCache = this.constructor._deepCopy(outgoingRequest.responseObject.result);
					this.mapCache.set(strKey, {
						expiresAt: nExpiresAtUnixTimestampMilliseconds,
						value: objectForCache
					});

					if(this.bDeepFreeze)
					{
						this.constructor._deepFreeze(objectForCache);
						this.constructor._deepFreeze(outgoingRequest.responseObject.result);
					}
				}
			}
		}
	}

	/**
	 * Checks if the cache entry has expired. It doesn't unset the entry if it did though (this is done outside of this function).
	 * 
	 * @param {string} strKey
	 * @returns {boolean}
	 */
	_isCacheEntryExpired(strKey)
	{
		if(!this.mapCache.has(strKey))
		{
			return true;
		}

		return Date.now() > this.mapCache.get(strKey).expiresAt;
	}


	/**
	 * @param {JSONRPC.OutgoingRequest} outgoingRequest
	 * @returns {string}
	 */
	static _getCacheKey(outgoingRequest)
	{
		return `${outgoingRequest.methodName}__${JSON.stringify(outgoingRequest.params)}`;
	}

	
	static _deepFreeze(object)
	{
		if(typeof object !== "object")
		{
			return;
		}

		Object.getOwnPropertyNames(object).forEach((propName) => 
		{
			const propValue = object[propName];

			if(typeof propValue === "object" && propValue != null)
			{
				Cache._deepFreeze(propValue);
			}
		});

		return Object.freeze(object);
	}

	
	/**
	 * @param {Object} object
	 * @returns {Object}
	 */
	static _deepCopy(object)
	{
		return JSON.parse(JSON.stringify(object));
	}


	/**
	 * @returns {string}
	 */
	static get DEFAULT_JSONRPC_VERSION()
	{
		return "2.0";
	}
};
