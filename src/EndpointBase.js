const url = require("url");

const assert = require("assert");

/**
 * This class is suposed to be extended by JSONRPC endpoints.
 * Endpoints hold exported RPC functions.
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
	 */
	constructor(strName, strPath, objReflection)
	{
		assert.strictEqual(typeof strName, "string");
		assert.strictEqual(typeof strPath, "string");
		assert.strictEqual(typeof objReflection, "object");

		this._strName = strName;
		this._strPath = EndpointBase.normalizePath(strPath);
		this._objReflection = objReflection;
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
	reflection()
	{
		return this._objReflection; 
	}


	/**
	 * @param {string} strPath
	 * 
	 * @returns {string}
	 */
	static normalizePath(strPath)
	{
		strPath = url.parse(strPath).pathname.trim();
		if(!strPath.length || strPath.substr(-1) !== "/")
		{
			strPath += "/";
		}

		return strPath;
	}
};
