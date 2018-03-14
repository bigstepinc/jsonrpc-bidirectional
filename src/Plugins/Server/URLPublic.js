const JSONRPC = {};
JSONRPC.ServerPluginBase = require("../../ServerPluginBase");
JSONRPC.Exception = require("../../Exception");

const assert = require("assert");
var forge = require("node-forge");
const querystring = require("querystring");
//It is disabled for now, until a better brotli library is found
// const brotli = require("brotli");
const zlib = require("zlib");

module.exports =
class URLPublic extends JSONRPC.ServerPluginBase
{
	constructor(objEncryptionKeys, strKeyIndex, strAPIKey, strCompressionType = URLPublic.COMPRESSION_TYPE_ZLIB)
	{
		super();

		URLPublic.validateEncryptionKeys(objEncryptionKeys);

		assert(typeof strKeyIndex === "string" && strKeyIndex.length > 0, `Invalid strKeyIndex set for URLPublic. Expected non-empty string, but got ${typeof strKeyIndex}.`);
		assert(typeof strAPIKey === "string" && strAPIKey.length > 0, `Invalid strAPIKey set for URLPublic. Expected non-empty string, but got ${typeof strAPIKey}.`);

		this._objEncryptionKeys = objEncryptionKeys;
		this._strKeyIndex = strKeyIndex;
		this._strAPIKey = strAPIKey;
		this._strCompressionType = strCompressionType;

		Object.seal(this);
	}


	/**
	 * Only MODE_AES_128 is enabled by default, because the others are unsafe.
	 *
	 * @returns {Array}
	 */
	get allowedEncryptionModes()
	{
		return [
			this.constructor.MODE_AES_128
			/*, this.constructor.MODE_BASE64, 
			this.constructor.MODE_PLAIN*/
		];
	}


	/**
	 * @returns {string}
	 */
	get compressionType()
	{
		return this._strCompressionType;
	}


	/**
	 * @param {string} strCompressionType
	 */
	set compressionType(strCompressionType)
	{
		assert(typeof strCompressionType === "string", `Invalid property type for compressionType in URLPublic. Expected "string", but got ${typeof strCompressionEnabled}.`);
		assert(
			this.constructor.allowedCompressionTypes.includes(strCompressionType),
			`Invalid compression type "${strCompressionType}". Allowed ones are: ${JSON.stringify(this.constructor.allowedCompressionTypes)}`
		);
		this._strCompressionType = strCompressionType;
	}


	/**
	 * Generates a request URL.
	 * 
	 * @param {string} strEndpointURL 
	 * @param {string} strFunctionName 
	 * @param {Array} arrParams 
	 * @param {Integer} nMaxAgeSeconds 
	 * @param {Integer} nEncryptionMode 
	 * 
	 * @returns {string}
	 */
	async URLRequestGenerate(strEndpointURL, strFunctionName, arrParams, nMaxAgeSeconds = null, nEncryptionMode = URLPublic.MODE_AES_128)
	{
		let objRequest = {
			[this.constructor.REQUEST_PARAM_NAME_METHOD]: strFunctionName,
			[this.constructor.REQUEST_PARAM_NAME_PARAMS]: arrParams
		};

		if(nMaxAgeSeconds !== null)
		{
			assert(Number.isInteger(nMaxAgeSeconds), `Invalid nMaxAgeSeconds parameter for URLRequestGenerate. Expected Integer, but got ${JSON.stringify(nMaxAgeSeconds)}.`);

			objRequest[this.constructor.REQUEST_PARAM_NAME_EXPIRE] = parseInt((new Date()).getTime() / 1000, 10) + nMaxAgeSeconds;
		}

		return this.JSONRequestToPublicURL(strEndpointURL, JSON.stringify(objRequest), nEncryptionMode);
	}


	/**
	 * 
	 * @param {string} strRequestURL 
	 * @param {string} strJSONRequest 
	 * @param {Integer} nMode 
	 * 
	 * @returns {string}
	 */
	async JSONRequestToPublicURL(strRequestURL, strJSONRequest, nMode = URLPublic.MODE_AES_128)
	{
		assert(typeof strJSONRequest === "string", `Invalid parameter type for strJSONRequest. Expected "string", but got "${typeof strJSONRequest}" value ${JSON.stringify(strJSONRequest)}.`);

		let objPublicRequest = null;
		switch(nMode)
		{
			case this.constructor.MODE_AES_128:
				objPublicRequest = await this.JSONRequestToURLEncryptedParams(strJSONRequest);
				break;
			case this.constructor.MODE_BASE64:
				objPublicRequest = await this.JSONRequestToURLBase64Params(strJSONRequest);
				break;
			case this.constructor.MODE_PLAIN:
				objPublicRequest = await this.JSONRequestToURLPlainParams(strJSONRequest);
				break;
			default:
				throw new JSONRPC.Exception(`Unhandled encryption mode ${JSON.stringify(nMode)}.`);
		}

		assert(objPublicRequest !== null, `Invalid objPublicRequest: ${JSON.stringify(objPublicRequest)}.`);

		if(nMode !== this.constructor.MODE_DEFAULT)
		{
			objPublicRequest[this.constructor.URL_PARAM_NAME_MODE] = nMode;
		}

		if(strRequestURL.includes("?"))
		{
			strRequestURL += "&";
		}
		else
		{
			strRequestURL += "?";
		}

		strRequestURL += querystring.stringify(objPublicRequest);

		return strRequestURL;
	}


	/**
	 * 
	 * @param {string} strJSONRequest 
	 * 
	 * @returns {Object}
	 */
	async JSONRequestToURLEncryptedParams(strJSONRequest)
	{
		let bufferIVAndSignature = this.JSONRequestSignatureAndIV(strJSONRequest);

		let strEncryptedParam = await this.URLParamEncrypt(strJSONRequest, bufferIVAndSignature);

		let objRequestObject = {
			[this._strKeyIndex]: this.constructor.base64URLEscape(strEncryptedParam),
			[this.constructor.URL_PARAM_NAME_VERIFY]: this.constructor.base64URLEscape(bufferIVAndSignature.toString("base64"))
		};

		return objRequestObject;
	}


	/**
	 * 
	 * @param {string} strJSONRequest 
	 * 
	 * @returns {Object}
	 */
	async JSONRequestToURLPlainParams(strJSONRequest)
	{
		let bufferIVAndSignature = this.JSONRequestSignatureAndIV(strJSONRequest);

		let objRequestObject = {
			[this._strKeyIndex]: strJSONRequest,
			[this.constructor.URL_PARAM_NAME_VERIFY]: this.constructor.base64URLEscape(bufferIVAndSignature.toString("base64"))
		};

		return objRequestObject;
	}


	/**
	 * 
	 * @param {string} strJSONRequest 
	 * 
	 * @returns {Object}
	 */
	async JSONRequestToURLBase64Params(strJSONRequest)
	{
		let bufferIVAndSignature = this.JSONRequestSignatureAndIV(strJSONRequest);

		let bufferCompresedData;

		bufferCompresedData = await this.constructor.compress(Buffer.from(strJSONRequest), this.compressionType);

		assert(typeof bufferCompresedData !== "undefined", "Invalid type for bufferCompresedData after compress.");

		let strBase64 = bufferCompresedData.toString("base64");

		let objRequestObject = {
			[this._strKeyIndex]: this.constructor.base64URLEscape(strBase64),
			[this.constructor.URL_PARAM_NAME_VERIFY]: this.constructor.base64URLEscape(bufferIVAndSignature.toString("base64"))
		};

		return objRequestObject;
	}


	/**
	 * Called before JSON parsing of the JSONRPC request.
	 *
	 * @param {JSONRPC.IncomingRequest} incomingRequest
	 */
	async beforeJSONDecode(incomingRequest)
	{
		if(
			incomingRequest.requestHTTPMethod !== "GET"
			|| typeof incomingRequest.requestHTTPGetQuery !== "object" 
			|| incomingRequest.requestHTTPGetQuery === null
		)
		{
			return;
		}

		let strJSONRequest = await this.PublicURLParamsToJSONRequest(incomingRequest.requestHTTPGetQuery);

		let objRequest = null;
		try
		{
			objRequest = JSON.parse(strJSONRequest);
		}
		catch(error)
		{
			console.error(error);
			throw new JSONRPC.Exception("Failed to decode URL request.");
		}

		objRequest.id = null;
		objRequest.jsonrpc = this.constructor.DEFAULT_JSONRPC_VERSION;
		objRequest.method = objRequest[this.constructor.REQUEST_PARAM_NAME_METHOD];
		objRequest.params = objRequest[this.constructor.REQUEST_PARAM_NAME_PARAMS];
		delete objRequest[this.constructor.REQUEST_PARAM_NAME_METHOD];
		delete objRequest[this.constructor.REQUEST_PARAM_NAME_PARAMS];

		if(objRequest.hasOwnProperty[this.constructor.REQUEST_PARAM_NAME_EXPIRE])
		{
			objRequest.expires = objRequest[this.constructor.REQUEST_PARAM_NAME_EXPIRE];
			delete objRequest[this.constructor.REQUEST_PARAM_NAME_EXPIRE];

			if(objRequest.expires < parseInt(((new Date()).getTime() / 1000), 10))
			{
				throw new JSONRPC.Exception("Replay attack prevention. Request is past \"expires\" timestamp.", JSONRPC.Exception.REQUEST_EXPIRED);
			}
		}

		incomingRequest.isAuthenticated = true;
		incomingRequest.isAuthorized = true;

		incomingRequest.requestBody = JSON.stringify(objRequest);
	}

	/**
	 * https://www.npmjs.com/package/node-forge#ciphers-1
	 *
	 * @param {string} strBase64Data
	 * @param {Buffer} bufferIV
	 *
	 * @returns {string}
	 */
	async URLParamDecrypt(strBase64Data, bufferIV)
	{
		assert(typeof strBase64Data === "string", `Invalid parameter type for strBase64Data in URLParamDecrypt. Expected "string" but got ${typeof strBase64Data}.`);
		let bufferJSONResult = null;
		let bUseBrotli = strBase64Data.substr(0, this.constructor.BROTLI_PREFIX.length) === this.constructor.BROTLI_PREFIX;
		let bNotCompressed = strBase64Data.substr(0, this.constructor.NONE_PREFIX.length) === this.constructor.NONE_PREFIX;
		let bufferEncryptedData;

		if(bUseBrotli)
		{
			bufferEncryptedData = Buffer.from(strBase64Data.substr(this.constructor.BROTLI_PREFIX.length), "base64");
		}
		else if(bNotCompressed)
		{
			bufferEncryptedData = Buffer.from(strBase64Data.substr(this.constructor.NONE_PREFIX.length), "base64");
		}
		else
		{
			bufferEncryptedData = Buffer.from(strBase64Data, "base64");
		}

		let decipher = forge.cipher.createDecipher("AES-CBC", this._objEncryptionKeys[this._strKeyIndex]);

		decipher.start({iv: forge.util.createBuffer(bufferIV)});
		decipher.update(forge.util.createBuffer(bufferEncryptedData));
		decipher.finish();

		let bufferDecryptedData = Buffer.from(decipher.output.getBytes(), "binary");


		let strCompressionType = this.constructor.COMPRESSION_TYPE_ZLIB;
		if(bUseBrotli)
		{
			strCompressionType = this.constructor.COMPRESSION_TYPE_BROTLI;
		}
		else if(bNotCompressed)
		{
			strCompressionType = this.constructor.NONE;
		}


		bufferJSONResult = await this.constructor.decompress(bufferDecryptedData, strCompressionType);
		assert(bufferJSONResult instanceof Buffer, `Invalid decompress return type for URLParamDecrypt. Expected "buffer" but got ${typeof bufferJSONResult}.`);

		let strJSONResult = bufferJSONResult.toString();
		assert(typeof strJSONResult === "string", `Invalid return type for URLParamDecrypt. Expected "string" but got ${typeof strJSONResult}.`);

		return strJSONResult;
	}

	/**
	 * 
	 * @param {string} strJSONRequest 
	 * 
	 * @returns {string}
	 */
	async URLParamDecode(strJSONRequest)
	{
		assert(typeof strJSONRequest === "string", `Invalid parameter type for strJSONRequest in URLParamDecode. Expected "string" but got ${typeof strJSONRequest}.`);
		let bUseBrotli = strJSONRequest.substr(0, this.constructor.BROTLI_PREFIX.length) === this.constructor.BROTLI_PREFIX;
		let bNotCompressed = strBase64Data.substr(0, this.constructor.NONE_PREFIX.length) === this.constructor.NONE_PREFIX;
		let bufferCompressedData;
		let bufferJSONResult = null;

		if(bUseBrotli)
		{
			bufferCompressedData = Buffer.from(strJSONRequest.substr(this.constructor.BROTLI_PREFIX.length), "base64");
		}
		else if(bNotCompressed)
		{
			bufferCompressedData = Buffer.from(strJSONRequest.substr(this.constructor.NONE_PREFIX.length), "base64");
		}
		else
		{
			bufferCompressedData = Buffer.from(strJSONRequest, "base64");
		}

		let strCompressionType = this.constructor.COMPRESSION_TYPE_ZLIB;
		if(bUseBrotli)
		{
			strCompressionType = this.constructor.COMPRESSION_TYPE_BROTLI;
		}
		else if(bNotCompressed)
		{
			strCompressionType = this.constructor.NONE;
		}

		bufferJSONResult = await this.constructor.decompress(bufferCompressedData, strCompressionType);
		assert(bufferJSONResult instanceof Buffer, `Invalid decompress return type for URLParamDecode. Expected "buffer" but got ${typeof bufferJSONResult}.`);

		let strJSONResult = bufferJSONResult.toString();
		assert(typeof strJSONResult === "string", `Invalid return type for URLParamDecode. Expected "string" but got ${typeof strJSONResult}.`);

		return strJSONResult;
	}

	/**
	 * 
	 * @param {string} strJSONRequest 
	 * @param {Buffer} bufferIV 
	 * 
	 * @returns {string}
	 */
	async URLParamEncrypt(strJSONRequest, bufferIV)
	{
		assert(typeof strJSONRequest === "string", `Invalid parameter type for strJSONRequest in URLParamEncrypt. Expected "string" but got ${typeof strJSONRequest}.`);
		let bufferEncryptedData;

		let bufferCompressedData = await this.constructor.compress(strJSONRequest, this.compressionType);
		assert(bufferCompressedData instanceof Buffer, "Failed to compress data before encryption." + JSON.stringify(bufferCompressedData));

		
		// throw new Error(JSON.stringify(this._objEncryptionKeys[this._strKeyIndex]));
		let decipher = forge.cipher.createCipher("AES-CBC", this._objEncryptionKeys[this._strKeyIndex]);

		decipher.start({iv: forge.util.createBuffer(bufferIV)});
		decipher.update(forge.util.createBuffer(bufferCompressedData));
		decipher.finish();

		bufferEncryptedData = Buffer.from(decipher.output.getBytes(), "binary");
		assert(typeof bufferEncryptedData !== "undefined" && bufferEncryptedData !== null && bufferEncryptedData instanceof Buffer, "Failed to encrypt data.");

		let strBase64Result = bufferEncryptedData.toString("base64");
		assert(typeof strBase64Result === "string", `Invalid return type for URLParamEncrypt. Expected "string" but got ${typeof strBase64Result}.`);

		strBase64Result = this.constructor.getPreffixForCompressionType(this.compressionType) + strBase64Result;

		//Test hash(decrypt(original_data)) == hash(encrypted_result)
		let strDecryptedData = await this.URLParamDecrypt(strBase64Result, bufferIV);
		let mdDecyptedData = forge.md.md5.create();
		mdDecyptedData.update(strDecryptedData);
		
		let mdOriginalData = forge.md.md5.create();
		mdOriginalData.update(strJSONRequest);

		if(mdDecyptedData.digest().toHex() !== mdOriginalData.digest().toHex())
		{
			throw new Error("Encrypted data failed decryption test.");
		}

		return strBase64Result;
	}

	/**
	 * 
	 * @param {Object} objParams 
	 * @param {boolean} bEmptyOnError 
	 * 
	 * @returns {string} JSON
	 */
	async PublicURLParamsToJSONRequest(objParams, bEmptyOnError = false)
	{
		try
		{
			for(let strEncryptionKeyIndex in this._objEncryptionKeys)
			{
				if(strEncryptionKeyIndex in objParams)
				{
					this._strKeyIndex = strEncryptionKeyIndex;

					objParams[strEncryptionKeyIndex] = objParams[strEncryptionKeyIndex].replace(" ", "+");//invalid text transform text mail clients fix

					if(!(this.constructor.URL_PARAM_NAME_VERIFY in objParams))
					{
						throw new JSONRPC.Exception(`URLPublic: Missing "${this.constructor.URL_PARAM_NAME_VERIFY}" URL parameter required for verifying the URL.`, JSONRPC.Exception.NOT_AUTHENTICATED);
					}

					let bufferVerify = Buffer.from(this.constructor.base64URLUnescape(objParams[this.constructor.URL_PARAM_NAME_VERIFY]), "base64");

					let nEncryptionMode = (this.constructor.URL_PARAM_NAME_MODE in objParams)
						? parseInt(objParams[this.constructor.URL_PARAM_NAME_MODE], 10)
						: this.constructor.MODE_DEFAULT
					;

					if(!this.allowedEncryptionModes.includes(nEncryptionMode))
					{
						throw new JSONRPC.Exception("Encryption mode not allowed.");
					}

					let strJSONRequest = null;

					switch(nEncryptionMode)
					{
						case this.constructor.MODE_AES_128:
							strJSONRequest = await this.URLParamDecrypt(this.constructor.base64URLUnescape(objParams[strEncryptionKeyIndex]), bufferVerify);
							break;
						case this.constructor.MODE_BASE64:
							strJSONRequest = await this.URLParamDecode(this.constructor.base64URLUnescape(objParams[strEncryptionKeyIndex]));
							break;
						case this.constructor.MODE_PLAIN:
							strJSONRequest = objParams[strEncryptionKeyIndex];
							break;
						default:
							throw new JSONRPC.Exception(`Unhandled encryption mode ${JSON.stringify(nEncryptionMode)}.`);
					}

					assert(typeof strJSONRequest === "string", "Invalid strJSONRequest after decoding.");

					let bufferSignatureForComparison = this.JSONRequestSignatureAndIV(strJSONRequest);

					if(!bufferSignatureForComparison.equals(bufferVerify))
					{
						throw new JSONRPC.Exception("Authentication failure. Verify hash incorrect.", JSONRPC.Exception.NOT_AUTHENTICATED);
					}

					return strJSONRequest;
				}
			}

			throw new JSONRPC.Exception("Invalid params.");
		}
		catch(error)
		{
			if(bEmptyOnError)
			{
				return JSON.stringify({});
			}

			throw error;
		}
	}

	/**
	 * https://www.npmjs.com/package/node-forge#message-digests-1
	 *
	 * @param {string} strJSONRequest
	 *
	 * @returns {Buffer}
	 */
	JSONRequestSignatureAndIV(strJSONRequest)
	{
		assert(typeof strJSONRequest === "string", `Invalid parameter type for JSONRequestSignatureAndIV. Expecting "string", but got "${typeof strJSONRequest}".`);

		let hmac = forge.hmac.create();
		hmac.start(this.constructor.HMAC_ALGORITHM, this._strAPIKey);
		hmac.update(strJSONRequest);

		return Buffer.from(hmac.digest().getBytes(), "binary");
	}

	/**
	 * 
	 * @param {string} strBase64 
	 * 
	 * @returns {string}
	 */
	static base64URLEscape(strBase64)
	{
		assert(typeof strBase64 === "string", `Invalid parameter type for base64URLEscape. Expecting "string", but got "${typeof strBase64}".`);
		return strBase64.replace("+", "-")
			.replace("/", "_")
			.replace("=", "");
	}

	/**
	 * 
	 * @param {string} strBase64URLSafe 
	 * 
	 * @returns {string}
	 */
	static base64URLUnescape(strBase64URLSafe)
	{
		assert(typeof strBase64URLSafe === "string", `Invalid parameter type for base64URLEscape. Expecting "string", but got "${typeof strBase64URLSafe}".`);
		return strBase64URLSafe.replace("-", "+")
			.replace("_", "/");
	}

	/**
	 * 
	 * @param {string} strRequest 
	 * @param {string} strCompressionType 
	 * 
	 * @returns {Buffer}
	 */
	static async compress(strRequest, strCompressionType = URLPublic.COMPRESSION_TYPE_ZLIB)
	{
		switch(strCompressionType)
		{
			case this.COMPRESSION_TYPE_BROTLI:
				throw new Error("Brotli compression is not supported yet.");
			//NOT IMPLEMENTED YET
			// case this.COMPRESSION_TYPE_BROTLI:
			// 	let uint8CompressedBuffer = brotli.compress(strRequest);
			// 	return Buffer.from(uint8CompressedBuffer);
			case this.COMPRESSION_TYPE_ZLIB:
				return new Promise((fnResolve, fnReject) => {
					zlib.deflate(strRequest, (error, buffer) => {
						if(error)
						{
							return fnReject(error);
						}

						fnResolve(buffer);
					});
				});
			case this.NONE:
				return Buffer.from(strRequest);
			default:
				throw new Error(`Invalid compression type "${strCompressionType}" for compress. Allowed ones are: ${JSON.stringify(this.allowedCompressionTypes)}`);
		}
	}

	/**
	 * 
	 * @param {Buffer} bufferCompressed 
	 * @param {string} strCompressionType 
	 * 
	 * @returns {Buffer}
	 */
	static async decompress(bufferCompressed, strCompressionType = URLPublic.COMPRESSION_TYPE_ZLIB)
	{
		switch(strCompressionType)
		{
			case this.COMPRESSION_TYPE_BROTLI:
				throw new Error("Brotli decompression is not supported yet.");
			//NOT IMPLEMENTED YET
			// case this.COMPRESSION_TYPE_BROTLI:
			// 	let uint8DecompressedBuffer = brotli.decompress(bufferCompressed);
			// 	return Buffer.from(uint8DecompressedBuffer);
			case this.COMPRESSION_TYPE_ZLIB:
				return new Promise((fnResolve, fnReject) => {
					zlib.inflate(bufferCompressed, (error, buffer) => {
						if(error)
						{
							return fnReject(error);
						}

						fnResolve(buffer);
					});
				});
			case this.NONE:
				return bufferCompressed;
			default:
				throw new Error(`Invalid compression type "${strCompressionType}" for decompress. Allowed ones are: ${JSON.stringify(this.allowedCompressionTypes)}`);
		}
	}

	/**
	 * 
	 * @param {string} strCompressionType 
	 * 
	 * @returns {string}
	 */
	static getPreffixForCompressionType(strCompressionType)
	{
		switch(strCompressionType)
		{
			case this.COMPRESSION_TYPE_BROTLI:
				return this.BROTLI_PREFIX;
			case this.NONE:
				return this.NONE_PREFIX;
			default:
				return "";
		}
	}

	/**
	 * Throws and error if the encryption keys object is not valid.
	 * 
	 * @param {Object} objEncryptionKeys 
	 * 
	 * @returns {undefined}
	 * 
	 * @throws {Error|TypeError}
	 */
	static validateEncryptionKeys(objEncryptionKeys)
	{
		if(
			typeof objEncryptionKeys !== "object"
			|| objEncryptionKeys === null
			|| Object.keys(objEncryptionKeys).length === 0
		)
		{
			throw new TypeError(`Invalid objEncryptionKeys for URLPublic. Expected non-empty object, but got ${ objEncryptionKeys === null ? "null " : ""}${typeof objEncryptionKeys}.`);
		};

		// Validate key length
		// https://www.npmjs.com/package/node-forge#ciphers-1
		// Note: a key size of 16 bytes will use AES-128, 24 => AES-192, 32 => AES-256
		// Otherwise a not so explicit error is thrown in the crypto library
		for(let strEncryptionKeyIndex in objEncryptionKeys)
		{
			if(![16, 24, 32].includes(objEncryptionKeys[strEncryptionKeyIndex].length))
			{
				throw new Error(`Invalid key with index ${JSON.stringify(strEncryptionKeyIndex)} in objEncryptionKeys for URLPublic. Key values must have 16, 24 or 32 characters, but ${objEncryptionKeys[strEncryptionKeyIndex].length} characters found.`);
			}
		}
	}

	/**
	 * @returns {Array}
	 */
	static get allowedCompressionTypes()
	{
		return [
			// this.COMPRESSION_TYPE_BROTLI, //NOT IMPLEMENTED YET
			this.COMPRESSION_TYPE_ZLIB,
			this.NONE
		];
	}

	static get URL_PARAM_NAME_VERIFY() { return "v"; }
	static get URL_PARAM_NAME_MODE() { return "m"; }

	static get REQUEST_PARAM_NAME_METHOD() { return "m"; }
	static get REQUEST_PARAM_NAME_PARAMS() { return "p"; }
	static get REQUEST_PARAM_NAME_EXPIRE() { return "e"; }

	// static get MODE_DEFAULT() { return this.MODE_AES_128; }
	static get MODE_DEFAULT() { return this.MODE_AES_128; }
	static get MODE_AES_128() { return 0; }
	static get MODE_PLAIN() { return 1; }
	static get MODE_BASE64() { return 2; }

	static get HMAC_ALGORITHM() { return "sha1"; }

	static get BROTLI_PREFIX() { return "br."; }
	static get NONE_PREFIX() { return "no."; }

	static get COMPRESSION_TYPE_ZLIB() { return "zlib"; }
	static get COMPRESSION_TYPE_BROTLI() { return "brotli"; }

	static get NONE() { return "none"; }

	/**
	 * Represents the JSONRPC version of the constructed request object from the request encoded string.
	 * 
	 * @returns {string}
	 */
	static get DEFAULT_JSONRPC_VERSION()
	{
		return "2.0";
	}
};
