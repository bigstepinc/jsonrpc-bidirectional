const JSONRPC = {};
JSONRPC.ClientPluginBase = require("../../ClientPluginBase");

module.exports =
class Cache extends JSONRPC.ClientPluginBase
{
	/**
	 * @param {Object} objFunctionToCacheSeconds . The keys are function names and the values are the number of seconds until the cached result expires. A value of -1 signifies that the cache never expires.
	 * @param {boolean} bDeepFreeze . If true, deep freeze the returned value using recursive Object.freeze.
	 * @param {boolean} bReturnDeepCopy . If true, return a deep copy of the cached value.
	 * @param {Function} fDeepCopy . The function used to create a deep copy of the response object.
	 * @param {number} nMaxEntries . The maximum number of entries in the cache. When this limit is reached, clear the cache.
	 */
	constructor(objFunctionToCacheSeconds = {}, bDeepFreeze = false, bReturnDeepCopy = false, fDeepCopy = undefined, nMaxEntries = 5000)
	{
		super();

		if(typeof objFunctionToCacheSeconds !== "object" || Array.isArray(objFunctionToCacheSeconds))
		{
			throw new Error("Invalid objFunctionToCacheSeconds parameter given.");
		}

		this._mapFunctionToCacheSeconds = new Map(Object.entries(objFunctionToCacheSeconds));
		this._bDeepFreeze = bDeepFreeze;
		this._bReturnDeepCopy = bReturnDeepCopy;
		this._fDeepCopy = fDeepCopy;
		this._nMaxEntries = nMaxEntries;

		if(this._fDeepCopy === undefined || this._fDeepCopy === null)
		{
			this._fDeepCopy = obj => JSON.parse(JSON.stringify(obj));
		}

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

		if(this._mapFunctionToCacheSeconds.has(outgoingRequest.methodName))
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

		if(outgoingRequest.methodName && this._mapFunctionToCacheSeconds.has(outgoingRequest.methodName))
		{
			const strKey = this.constructor._getCacheKey(outgoingRequest);

			if(this.mapCache.has(strKey))
			{
				const cachedValue = this.mapCache.get(strKey).value;

				if(this._bReturnDeepCopy)
				{
					outgoingRequest.responseObject.result = this._fDeepCopy(cachedValue);

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
				const nFunctionCacheDurationSeconds = this._mapFunctionToCacheSeconds.get(outgoingRequest.methodName);
				const timestampExpiresAt = nFunctionCacheDurationSeconds !== -1 ? nFunctionCacheDurationSeconds * 1000 + Date.now() : -1;

				if(this._bDeepFreeze && !this._bReturnDeepCopy)
				{
					this.constructor._deepFreeze(outgoingRequest.responseObject.result);
					this.mapCache.set(strKey, {
						expiresAt: timestampExpiresAt,
						value: outgoingRequest.responseObject.result
					});
				}
				else
				{
					const objectForCache = this._fDeepCopy(outgoingRequest.responseObject.result);
					this.mapCache.set(strKey, {
						expiresAt: timestampExpiresAt,
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
	 * The -1 expiresAt value signifies that the cache entry never expires.
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

		return this.mapCache.get(strKey).expiresAt !== -1 && Date.now() > this.mapCache.get(strKey).expiresAt;
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
	 * @returns {string}
	 */
	static get DEFAULT_JSONRPC_VERSION()
	{
		return "2.0";
	}
};
