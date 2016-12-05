const JSONRPC={};
JSONRPC.ClientPluginBase=require("../../ClientPluginBase");

const HMAC_SHA256=require("crypto-js/hmac-sha256");

/**
 * SignatureAdd plugin.
 * @class
 * @extends JSONRPC.ClientPluginBase
 */
module.exports=
class SignatureAdd extends JSONRPC.ClientPluginBase
{
	/**
	 * @param {string} strAPIKey
	 * @param {Array} arrExtraURLVariables
	 */
	constructor(strAPIKey, arrExtraURLVariables)
	{
		super();

		this.strAPIKey=strAPIKey;
		this._arrExtraURLVariables=arrExtraURLVariables;
		this.strKeyMetaData=SignatureAdd.getKeyMetaData(strAPIKey);
	}

	/**
	 * @static
	 * @param {string} strKey
	 * @returns {String}
	 */
	static getKeyMetaData(strKey)
	{
		let strMeta=null;
		const arrAPIKey=strKey.split(":", 2);

		if(arrAPIKey.length!=1)
		{
			strMeta=arrAPIKey[0];
		}

		return strMeta;
	}

	/**
	 * @param {Object} objFilterParams - It allows for reference return for multiple params. It contains:
	 * {Object} objRequest
	 */
	beforeJSONEncode(objFilterParams)
	{
		/*
		 Not setting expires to allow HTTP caching AND because the browser machine's UTC time is wrong for a lot of users.
		 Unknowingly users are setting the wrong timezone with the wrong UTC time, while the local time *appears* to be correct.
		 */
		objFilterParams.objRequest["expires"]=parseInt((new Date().getTime())+86400);
	}

	/**
	 * @param {Object} objFilterParams - It allows for reference return for multiple params. It contains:
	 * {String} strJSONRequest
	 * {String} strEndpointURL
	 * {Array} arrHTTPHeaders
	 */
	afterJSONEncode(objFilterParams)
	{
		let strVerifyHash=HMAC_SHA256(objFilterParams.strJSONRequest, this.strAPIKey);

		if(this.strKeyMetaData!==null)
			strVerifyHash = this.strKeyMetaData + ":" + strVerifyHash;

		if(objFilterParams.strEndpointURL.indexOf("?")>-1)
			objFilterParams.strEndpointURL+="&";
		else
			objFilterParams.strEndpointURL+="?";

		if(objFilterParams.strEndpointURL.indexOf("verify")==-1)
			objFilterParams.strEndpointURL+="verify="+(strVerifyHash);

		if(objFilterParams.strEndpointURL.charAt(objFilterParams.strEndpointURL.length-1)=='&')
			objFilterParams.strEndpointURL=objFilterParams.strEndpointURL.slice(0, -1);

		for(let strName in this._arrExtraURLVariables)
			objFilterParams.strEndpointURL+="&"+strName+"="+this._arrExtraURLVariables[strName];
	}
};