const JSONRPC = {};
JSONRPC.ClientPluginBase = require("../../ClientPluginBase");

const HMAC_SHA256 = require("crypto-js/hmac-sha256");


module.exports =
class SignatureAdd extends JSONRPC.ClientPluginBase
{
	/**
	 * @param {string} strAPIKey
	 * @param {Array} arrExtraURLVariables
	 */
	constructor(strAPIKey, arrExtraURLVariables)
	{
		super();

		this.strAPIKey = strAPIKey;
		this._arrExtraURLVariables = arrExtraURLVariables;
		this.strKeyMetaData = SignatureAdd.getKeyMetaData(strAPIKey);
	}


	/**
	 * @param {string} strKey
	 * @returns {string}
	 */
	static getKeyMetaData(strKey)
	{
		let strMeta = null;
		const arrAPIKey = strKey.split(":", 2);

		if(arrAPIKey.length !== 1)
		{
			strMeta = arrAPIKey[0];
		}

		return strMeta;
	}
	

	/**
	 * @param {JSONRPC.OutgoingRequest} jsonrpcRequest
	 */
	beforeJSONEncode(jsonrpcRequest)
	{
		// Not setting expires to allow HTTP caching AND because the browser machine's UTC time is wrong for a lot of users.
		// Unknowingly users are setting the wrong timezone with the wrong UTC time, while the local time *appears* to be correct.

		jsonrpcRequest.requestObject["expires"] = parseInt((new Date().getTime()) + 86400, 10);
	}


	/**
	 * @param {JSONRPC.OutgoingRequest} jsonrpcRequest
	 */
	afterJSONEncode(jsonrpcRequest)
	{
		let strVerifyHash = HMAC_SHA256(jsonrpcRequest.requestBody, this.strAPIKey);

		if(this.strKeyMetaData !== null)
		{
			strVerifyHash = this.strKeyMetaData + ":" + strVerifyHash;
		}

		if(jsonrpcRequest.endpointURL.indexOf("?") > -1)
		{
			jsonrpcRequest.endpointURL += "&"; 
		}
		else
		{
			jsonrpcRequest.endpointURL += "?"; 
		}

		if(jsonrpcRequest.endpointURL.indexOf("verify") === -1)
		{
			jsonrpcRequest.endpointURL += "verify=" + (strVerifyHash);
		}

		if(jsonrpcRequest.endpointURL.charAt(jsonrpcRequest.endpointURL.length - 1) === "&")
		{
			jsonrpcRequest.endpointURL = jsonrpcRequest.endpointURL.slice(0, -1); 
		}

		for(let strName in this._arrExtraURLVariables)
		{
			jsonrpcRequest.endpointURL += "&" + strName + "=" + this._arrExtraURLVariables[strName]; 
		}
	}
};
