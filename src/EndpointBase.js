const url = require("url");

const assert = require("assert");

/**
 * This class is suposed to be extended by JSONRPC endpoints.
 * Endpoints hold exported RPC functions.
 * 
 * All exported functions must accept a JSONRPC.IncomingRequest class instance as first param.
 * 
 * Methods defined by subclasses, which are to be exported through RPC, 
 * must each return a single Promise object or simply decorated with async so they are awaitable. 
 */
module.exports =
class EndpointBase
{
	/**
	 * @param {string} strName
	 * @param {string} strPath
	 * @param {Object} objReflection
	 * @param {Class|null} classReverseCallsClient
	 */
	constructor(strName, strPath, objReflection, classReverseCallsClient)
	{
		assert.strictEqual(typeof strName, "string");
		assert.strictEqual(typeof strPath, "string");
		assert.strictEqual(typeof objReflection, "object");

		this._strName = strName;
		this._strPath = EndpointBase.normalizePath(strPath);
		this._objReflection = objReflection;
		this._classReverseCallsClient = classReverseCallsClient;
	}


	/**
	 * @returns {string}
	 */
	get path()
	{
		return this._strPath;
	}


	/**
	 * @returns {string}
	 */
	get name()
	{
		return this._strName;
	}


	/**
	 * @returns {Object}
	 */
	get reflection()
	{
		return this._objReflection; 
	}


	/**
	 * @returns {Class|null}
	 */
	get ReverseCallsClientClass()
	{
		return this._classReverseCallsClient;
	}


	/**
	 * @param {string} strURL
	 * 
	 * @returns {string}
	 */
	static normalizePath(strURL)
	{
		let strPath = url.parse(strURL).pathname.trim();
		if(!strPath.length || strPath.substr(-1) !== "/")
		{
			strPath += "/";
		}

		if(strPath.substr(0, 1) !== "/")
		{
			strPath = "/" + strPath;
		}

		return strPath;
	}
};
