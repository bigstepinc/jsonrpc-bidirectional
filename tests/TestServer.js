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

		await this.triggerAuthenticationError();
		await this.triggerAuthorizationError();

		this._jsonrpcServer.addPlugin(this._authorizeAllPlugin);
		this._jsonrpcServer.addPlugin(this._authenticationSkipPlugin);

		await this.callRPCMethod();

		await this.callRPCMethodWhichThrowsJSONRPCException();
		await this.callRPCMethodWhichThrowsSimpleError();

		console.log("Finished all tests!!!");
	}


	/**
	 * @returns {undefined} 
	 */
	async triggerConnectionRefused()
	{
		try
		{
			assert.throws(await this._jsonrpcClient._rpc("ping", ["pong"]));
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
	async triggerAuthenticationError()
	{
		this._jsonrpcServer.addPlugin(this._authorizeAllPlugin);
		this._jsonrpcServer.removePlugin(this._authenticationSkipPlugin);
		try
		{
			assert.throws(await this._jsonrpcClient._rpc("ping", []));
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
			assert.throws(await this._jsonrpcClient._rpc("ping", []));
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
		assert.strictEqual("pong", await this._jsonrpcClient._rpc("ping", ["pong"]));
	}


	/**
	 * @returns {undefined}
	 */
	async callRPCMethodWhichThrowsJSONRPCException()
	{
		try
		{
			assert.throws(await this._jsonrpcClient._rpc("throwJSONRPCException", []));
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
			assert.throws(await this._jsonrpcClient._rpc("throwError", []));
		}
		catch(error)
		{
			if(error.constructor.name === "AssertionError")
			{
				throw error;
			}
			
			assert(error instanceof JSONRPC.Exception);
			assert.strictEqual(error.code, 0);
			assert.strictEqual(error.message, "Error");
		}
	}
};
