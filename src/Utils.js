const JSONRPC = {};
JSONRPC.Exception = require("./Exception");

/**
 * Utils class.
 * @class
 */
module.exports =	
class Utils
{
	constructor()
	{
		Object.seal(this);
	}


	/**
	 * @param {string} strJSON
	 * 
	 * @returns {null|Object|Array|string|boolean|number}
	 */
	static jsonDecodeSafe(strJSON)
	{
		try
		{
			return JSON.parse(strJSON);
		}
		catch(error)
		{
			// V8 doesn't have a stacktrace for JSON.parse errors.
			// A re-throw is absolutely necessary to enable debugging.
			throw new JSONRPC.Exception(error.message + "; RAW JSON string: " + JSON.stringify(strJSON), JSONRPC.Exception.PARSE_ERROR);
		}
	}
};
