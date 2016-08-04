"use strict";

/*
* TODO:
* Comments to JSDOC3
* */

var JSONRPC_Filter_Client=JSONRPC_Filter_Client || {};

JSONRPC_Filter_Client.SignatureAdd=class extends JSONRPC.ClientFilterBase
{
	constructor(strAPIKey, arrExtraURLVariables)
	{
		super();

		this.strAPIKey=strAPIKey;
		this._arrExtraURLVariables=arrExtraURLVariables;
		this.strKeyMetaData=JSONRPC_Filter_Client.SignatureAdd.getKeyMetaData(strAPIKey);
	}

	static getKeyMetaData(key)
	{
		var strMeta=null;
		var arrAPIKey=key.split(":", 2);

		if(arrAPIKey.length!=1)
		{
			strMeta=arrAPIKey[0];
		}

		return strMeta;
	}

	beforeJSONEncode(objFilterParams)
	{
		// Not setting expires to allow HTTP caching AND because the browser machine's UTC time is wrong for a lot of users
		// (unknowingly users are setting the wrong timezone with the wrong UTC time, while the local time *appears* to be correct).
		objFilterParams.objRequest["expires"]=parseInt((new Date().getTime())+86400);
	}

	afterJSONEncode(objFilterParams)
	{
		var strVerifyHash=CryptoJS.HmacSHA256(objFilterParams.strJSONRequest, this.strAPIKey);

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

		for(var strVarName in this._arrExtraURLVariables)
			objFilterParams.strEndpointURL+="&"+strVarName+"="+this._arrExtraURLVariables[strVarName];
	}
};