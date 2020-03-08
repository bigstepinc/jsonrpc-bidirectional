const url = require("url");

const assert = require("assert");

const EventEmitter = require("events");

let TypescriptParserNamespace = null;
try
{
	TypescriptParserNamespace = require("typescript-parser");
}
catch(error)
{
	// Ignored optional dependency.
}


/**
 * This class is suposed to be extended by JSONRPC endpoints.
 * Endpoints hold exported RPC functions.
 * 
 * All exported functions must accept a JSONRPC.IncomingRequest class instance as first param.
 * 
 * Methods defined by subclasses, which are to be exported through RPC, 
 * must each return a single Promise object or simply decorated with async so they are awaitable. 
 * 
 * @event disposed
 */
class EndpointBase extends EventEmitter
{
	/**
	 * @param {string} strName
	 * @param {string} strPath
	 * @param {object} objReflection
	 * @param {Class|null} classReverseCallsClient
	 */
	constructor(strName, strPath, objReflection, classReverseCallsClient)
	{
		super();
		
		assert.strictEqual(typeof strName, "string");
		assert.strictEqual(typeof strPath, "string");
		assert.strictEqual(typeof objReflection, "object");

		this._strName = strName;
		this._strPath = EndpointBase.normalizePath(strPath);
		this._objReflection = objReflection;
		this._classReverseCallsClient = classReverseCallsClient;
	}


	/**
	 * @returns {null}
	 */
	dispose()
	{
		this.emit("disposed");
	}


	/**
	 * Brings methods of some class instance into this class (mixins, traits).
	 * 
	 * The mixin functions will be executed in the context of this class instance, 
	 * so the source class shouldn't have any member properties, or the member properties' code would need to be duplicated in this class.
	 * 
	 * The source class instance is considered a trait.
	 * 
	 * @param {*} classInstance
	 */
	_mixTraitIntoThis(classInstance)
	{
		for(const strFunctionName of Object.getOwnPropertyNames(classInstance.constructor.prototype))
		{
			if(typeof classInstance.constructor.prototype[strFunctionName] === "function" && strFunctionName !== "constructor")
			{
				this.constructor.prototype[strFunctionName] = classInstance[strFunctionName];
			}
		}
	};


	/**
	 * Utility function to be used in a build process.
	 * 
	 * Example usage: await this._buildAPIClientSourceCode([this]);
	 * 
	 * @param {Array<*>} arrAPITraits 
	 * @param {string} strClassName
	 * @param {string|null} strTemplate = null
	 */
	static async _buildAPIClientSourceCode(arrAPITraits, strClassName, strTemplate = null)
	{
		assert(Array.isArray(arrAPITraits), "arrAPITraits needs to be an Array");
		assert(typeof strClassName === "string", "strClassName was suposed to be of type string.");
		assert(typeof strTemplate === "string" || strTemplate === null, "strTemplate was suposed to be of type string or null.");

		let strServerAPIClientMethods = "";
		for(const classInstance of arrAPITraits)
		{
			const objParsedJavaScript = await (new TypescriptParserNamespace.TypescriptParser()).parseSource(classInstance.constructor.toString());
			
			for(const objMethod of objParsedJavaScript.declarations[0].methods)
			{
				if(!objMethod.name.startsWith("_") && objMethod !== "constructor")
				{
					const arrParameterNames = [];
	
					if(!objMethod.parameters.length || objMethod.parameters[0].name !== "incomingRequest")
					{
						console.error(`Warning. First parameter of ${classInstance.constructor.name}.${objMethod.name}() is not incomingRequest. That param is mandatory for API exported functions.`);
						// process.exit(1);
						continue;
					}
					
					objMethod.parameters.splice(0, 1);
	
					for(const objParameter of objMethod.parameters)
					{
						if(objParameter.startCharacter === "{")
						{
							arrParameterNames.push("objDestructuringParam_" + objParameter.name.replace(/[^A-Za-z0-9_]+/g, "__") + "={}");
						}
						else
						{
							arrParameterNames.push(objParameter.name);
						}
					}
					strServerAPIClientMethods += `
						async ${objMethod.name}(${arrParameterNames.join(", ")})
						{
							return this.rpc("${objMethod.name}", [...arguments]);
						}
					`.replace(/^\t{5}/gm, "");
				}
			}
					
			/*for(const strFunctionName of Object.getOwnPropertyNames(classInstance.constructor.prototype))
			{
				if(typeof classInstance.constructor.prototype[strFunctionName] === "function" && !strFunctionName.startsWith("_") && strFunctionName !== "constructor")
				{
					strServerAPIClientMethods += `
						async ${strFunctionName}()
						{
							return this.rpc("${strFunctionName}", [...arguments]);
						}
					`;
				}
			}*/
		}
		
		let strAPIClient = (strTemplate || `
			const JSONRPC = require("jsonrpc-bidirectional");
			class ${strClassName} extends JSONRPC.Client
			{
				_INSERT_METHODS_HERE_
			};
			module.exports = ${strClassName};
		`).replace(/^\t{3}/gm, "").replace("_INSERT_METHODS_HERE_", strServerAPIClientMethods);
		
		return strAPIClient;
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
	 * @returns {object}
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
		const objURLParsed = url.parse(strURL);
		let strPath = objURLParsed.pathname ? objURLParsed.pathname.trim() : "/";
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

module.exports = EndpointBase;
