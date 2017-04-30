const JSONRPC = {};
JSONRPC.ClientPluginBase = require("../../ClientPluginBase");

const JSSHA = require("jssha");
//const HMAC_SHA256 = require("crypto-js/hmac-sha256");

/**
 * This has purpose at Bigstep (the company which originally created this project).
 * It is intended to be used only together with Bigstep extending API clients.
 * Please ignore otherwise.
 */
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
		outgoingRequest.requestObject["expires"] = parseInt((new Date().getTime()) / 1000 + 86400, 10);
	}


	/**
	 * @param {JSONRPC.OutgoingRequest} outgoingRequest
	 */
	async afterJSONEncode(outgoingRequest)
	{
		const sha = new JSSHA("SHA-256", "TEXT");
		sha.setHMACKey(this.strAPIKey, "TEXT");
		sha.update(outgoingRequest.requestBody);
		let strVerifyHash = sha.getHMAC("HEX");
		//let strVerifyHash = HMAC_SHA256(outgoingRequest.requestBody, this.strAPIKey);

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
