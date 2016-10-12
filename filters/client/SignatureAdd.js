"use strict";

/**
 * JSONRPC.Filter.Client namespace.
 * @namespace
 */
var JSONRPC=JSONRPC || {};
JSONRPC.Filter=JSONRPC.Filter || {};
JSONRPC.Filter.Client=JSONRPC.Filter.Client || {};

/**
 * SignatureAdd plugin.
 * @class
 * @extends JSONRPC.ClientFilterBase
 */
JSONRPC.Filter.Client.SignatureAdd=class extends JSONRPC.ClientFilterBase
{
	/**
	 * @param {String} strAPIKey
	 * @param {Array} arrExtraURLletiables
	 */
	constructor(strAPIKey, arrExtraURLletiables)
	{
		super();

		this.strAPIKey=strAPIKey;
		this._arrExtraURLletiables=arrExtraURLletiables;
		this.strKeyMetaData=JSONRPC.Filter.Client.SignatureAdd.getKeyMetaData(strAPIKey);
	}

	/**
	 * @static
	 * @param {String} strKey
	 * @returns {String}
	 */
	static getKeyMetaData(strKey)
	{
		let strMeta=null;
		let arrAPIKey=strKey.split(":", 2);

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
		Not setting expires to allow HTTP caching AND because the browser machine's UTC time is wrong for a lot of users
		Unknowingly users are setting the wrong timezone with the wrong UTC time, while the local time *appears* to be correct
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
		let strVerifyHash=CryptoJS.HmacSHA256(objFilterParams.strJSONRequest, this.strAPIKey);

		if(this.strKeyMetaData!==null)
			strVerifyHash=this.strKeyMetaData+":"+strVerifyHash;

		if(objFilterParams.strEndpointURL.indexOf("?")>-1)
			objFilterParams.strEndpointURL+="&";
		else
			objFilterParams.strEndpointURL+="?";

		if(objFilterParams.strEndpointURL.indexOf("verify")==-1)
			objFilterParams.strEndpointURL+="verify="+(strVerifyHash);

		if(objFilterParams.strEndpointURL.charAt(objFilterParams.strEndpointURL.length-1)=='&')
			objFilterParams.strEndpointURL=objFilterParams.strEndpointURL.slice(0, -1);

		for(let strletName in this._arrExtraURLletiables)
			objFilterParams.strEndpointURL+="&"+strletName+"="+this._arrExtraURLletiables[strletName];
	}
};