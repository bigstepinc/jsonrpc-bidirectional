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
	 * @param {JSONRPC.OutgoingRequest} outgoingRequest
	 */
	async beforeJSONEncode(outgoingRequest)
	{
		// Not setting expires to allow HTTP caching AND because the browser machine's UTC time is wrong for a lot of users.
		// Unknowingly users are setting the wrong timezone with the wrong UTC time, while the local time *appears* to be correct.

		outgoingRequest.requestObject["expires"] = parseInt((new Date().getTime()) + 86400, 10);
	}


	/**
	 * @param {JSONRPC.OutgoingRequest} outgoingRequest
	 */
	async afterJSONEncode(outgoingRequest)
	{
		let strVerifyHash = HMAC_SHA256(outgoingRequest.requestBody, this.strAPIKey);

		if(this.strKeyMetaData !== null)
		{
			strVerifyHash = this.strKeyMetaData + ":" + strVerifyHash;
		}

		if(outgoingRequest.endpointURL.indexOf("?") > -1)
		{
			outgoingRequest.endpointURL += "&"; 
		}
		else
		{
			outgoingRequest.endpointURL += "?"; 
		}

		if(outgoingRequest.endpointURL.indexOf("verify") === -1)
		{
			outgoingRequest.endpointURL += "verify=" + (strVerifyHash);
		}

		if(outgoingRequest.endpointURL.charAt(outgoingRequest.endpointURL.length - 1) === "&")
		{
			outgoingRequest.endpointURL = outgoingRequest.endpointURL.slice(0, -1); 
		}

		for(let strName in this._arrExtraURLVariables)
		{
			outgoingRequest.endpointURL += "&" + strName + "=" + this._arrExtraURLVariables[strName]; 
		}
	}
};
