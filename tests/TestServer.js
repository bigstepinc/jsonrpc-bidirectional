const JSONRPC = require("../index").JSONRPC;

const http = require("http");

const TestEndpoint = require("./TestEndpoint");

const assert = require("assert");

module.exports =
class TestServer
{
	constructor()
	{
		this._jsonrpcServer = null;
		this._jsonrpcClient = null;
		this._authenticationSkipPlugin = null;
		this._authorizeAllPlugin = null;

		Object.seal(this);
	}


	/**
	 * @returns {undefined}
	 */
	async runTests()
	{
		this._jsonrpcClient = new JSONRPC.Client("http://localhost:8324/api");
		this._jsonrpcClient.addPlugin(new JSONRPC.Plugins.Client.DebugLogger());

		this._authenticationSkipPlugin = new JSONRPC.Plugins.Server.AuthenticationSkip();
		this._authorizeAllPlugin = new JSONRPC.Plugins.Server.AuthorizeAll();

		
		await this.triggerConnectionRefused();
		
		await this.startServer();

		await this.endpointNotFoundError();
		await this.outsideJSONRPCPathError();

		await this.triggerAuthenticationError();
		await this.triggerAuthorizationError();

		this._jsonrpcServer.addPlugin(this._authorizeAllPlugin);
		this._jsonrpcServer.addPlugin(this._authenticationSkipPlugin);

		await this.callRPCMethod();

		await this.callRPCMethodWhichThrowsJSONRPCException();
		await this.callRPCMethodWhichThrowsSimpleError();

		await this.manyCallsInParallel();

		console.log("Finished all tests!!!");
	}


	/**
	 * @returns {undefined} 
	 */
	async triggerConnectionRefused()
	{
		try
		{
			assert.throws(await this._jsonrpcClient.rpc("ping", ["pong"]));
		}
		catch(error)
		{
			if(error.constructor.name !== "FetchError")
			{
				throw error;
			}
			
			if(process.execPath)
			{
				// nodejs specific error.
				assert(error.message.includes("ECONNREFUSED"));
			}
		}
	}


	/**
	 * @returns {undefined}
	 */
	async startServer()
	{
		const httpServer = http.createServer();
		this._jsonrpcServer = new JSONRPC.Server();

		this._jsonrpcServer.registerEndpoint(new TestEndpoint());

		this._jsonrpcServer.attachToHTTPServer(httpServer, "/api/");

		httpServer.listen(8324);
	}


	/**
	 * @returns {undefined} 
	 */
	async endpointNotFoundError()
	{
		const client = new JSONRPC.Client("http://localhost:8324/api/bad-endpoint-path");
		client.addPlugin(new JSONRPC.Plugins.Client.DebugLogger());

		try
		{
			assert.throws(await client.rpc("ping", []));
		}
		catch(error)
		{
			if(error.constructor.name === "AssertionError")
			{
				throw error;
			}
			
			assert(error instanceof JSONRPC.Exception);
			assert.strictEqual(error.code, JSONRPC.Exception.METHOD_NOT_FOUND);
			assert(error.message.includes("Unknown JSONRPC endpoint"));
		}
	}


	/**
	 * @returns {undefined} 
	 */
	async outsideJSONRPCPathError()
	{
		const client = new JSONRPC.Client("http://localhost:8324/unhandled-path");
		client.addPlugin(new JSONRPC.Plugins.Client.DebugLogger());

		try
		{
			assert.throws(await client.rpc("ping", []));
		}
		catch(error)
		{
			if(error.constructor.name === "AssertionError")
			{
				throw error;
			}
			
			assert(error instanceof JSONRPC.Exception);
			assert.strictEqual(error.code, JSONRPC.Exception.PARSE_ERROR);
			assert(error.message.includes("Unexpected end of JSON input; RAW JSON string:"));
		}
	}


	/**
	 * @returns {undefined}
	 */
	async triggerAuthenticationError()
	{
		this._jsonrpcServer.addPlugin(this._authorizeAllPlugin);
		this._jsonrpcServer.removePlugin(this._authenticationSkipPlugin);
		try
		{
			assert.throws(await this._jsonrpcClient.rpc("ping", []));
		}
		catch(error)
		{
			if(error.constructor.name === "AssertionError")
			{
				throw error;
			}
			
			assert(error instanceof JSONRPC.Exception);
			assert.strictEqual(error.code, JSONRPC.Exception.NOT_AUTHENTICATED);
			assert.strictEqual(error.message, "Not authenticated.");
		}
	}


	/**
	 * @returns {undefined} 
	 */
	async triggerAuthorizationError()
	{
		this._jsonrpcServer.removePlugin(this._authorizeAllPlugin);
		this._jsonrpcServer.addPlugin(this._authenticationSkipPlugin);
		try
		{
			assert.throws(await this._jsonrpcClient.rpc("ping", []));
		}
		catch(error)
		{
			if(error.constructor.name === "AssertionError")
			{
				throw error;
			}
			
			assert(error instanceof JSONRPC.Exception);
			assert.strictEqual(error.code, JSONRPC.Exception.NOT_AUTHORIZED);
			assert.strictEqual(error.message, "Not authorized.");
		}
	}


	/**
	 * @returns {undefined}
	 */
	async callRPCMethod()
	{
		const strParam = "pong_" + (this._jsonrpcClient.callID);
		assert.strictEqual(strParam, await this._jsonrpcClient.rpc("ping", [strParam]));
	}


	/**
	 * @returns {undefined}
	 */
	async callRPCMethodWhichThrowsJSONRPCException()
	{
		try
		{
			assert.throws(await this._jsonrpcClient.rpc("throwJSONRPCException", []));
		}
		catch(error)
		{
			if(error.constructor.name === "AssertionError")
			{
				throw error;
			}
			
			assert(error instanceof JSONRPC.Exception);
			assert.strictEqual(error.code, JSONRPC.Exception.INTERNAL_ERROR);
			assert.strictEqual(error.message, "JSONRPC.Exception");
		}
	}


	/**
	 * @returns {undefined} 
	 */
	async callRPCMethodWhichThrowsSimpleError()
	{
		try
		{
			assert.throws(await this._jsonrpcClient.rpc("throwError", []));
		}
		catch(error)
		{
			if(error.constructor.name === "AssertionError")
			{
				throw error;
			}
			
			assert(error instanceof JSONRPC.Exception, error.constructor.name);
			assert.strictEqual(error.code, 0);
			assert.strictEqual(error.message, "Error");
		}
	}


	/**
	 * @returns {undefined} 
	 */
	async manyCallsInParallel()
	{
		const arrPromises = [];

		const arrMethods = [
			this.callRPCMethod,

			this.callRPCMethodWhichThrowsSimpleError,
			this.callRPCMethodWhichThrowsJSONRPCException,
			
			this.callRPCMethod,
			this.callRPCMethod
		];

		// http://smallvoid.com/article/winnt-tcpip-max-limit.html
		// https://blog.jayway.com/2015/04/13/600k-concurrent-websocket-connections-on-aws-using-node-js/
		// http://stackoverflow.com/questions/17033631/node-js-maxing-out-at-1000-concurrent-connections
		for(let i = 0; i < 700; i++)
		{
			arrPromises.push(arrMethods[Math.round(Math.random() * (arrMethods.length - 1))].apply(this, []));
		}

		await Promise.all(arrPromises);
	}
};
