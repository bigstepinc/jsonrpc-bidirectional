const JSONRPC=require("../index").JSONRPC;

const http = require("http");

const TestEndpoint = require("./TestEndpoint");

const assert = require("assert");

module.exports=
class TestServer
{
	constructor()
	{
		this._jsonrpcServer=null;
	}


	/**
	 * @return {http.Server}
	 */
	async fireUp()
	{
		const httpServer=http.createServer();
		this._jsonrpcServer=new JSONRPC.Server();

		this._jsonrpcServer.registerEndpoint(new TestEndpoint());

		this._jsonrpcServer.attachToHTTPServer(httpServer);

		httpServer.listen(8324);

		return httpServer;
	}


	/**
	 * @return {JSONRPC.Client}
	 */
	async testCalls()
	{
		const client=new JSONRPC.Client("http://localhost:8324/api");
		client.addPlugin(new JSONRPC.Plugins.Client.DebugLogger());

		const authenticationSkipPlugin=new JSONRPC.Plugins.Server.AuthenticationSkip();
		const authorizeAllPlugin=new JSONRPC.Plugins.Server.AuthorizeAll();


		this._jsonrpcServer.addPlugin(authorizeAllPlugin);
		try
		{
			assert.throws(await client._rpc("ping", []));
		}
		catch(error)
		{
			if(error.constructor.name==="AssertionError")
			{
				throw error;
			}
			
			assert(error instanceof JSONRPC.Exception);
			assert.strictEqual(error.code, JSONRPC.Exception.NOT_AUTHENTICATED);
			assert.strictEqual(error.message, "Not authenticated.");
		}


		this._jsonrpcServer.removePlugin(authorizeAllPlugin);
		this._jsonrpcServer.addPlugin(authenticationSkipPlugin);
		try
		{
			assert.throws(await client._rpc("ping", []));
		}
		catch(error)
		{
			if(error.constructor.name==="AssertionError")
			{
				throw error;
			}
			
			assert(error instanceof JSONRPC.Exception);
			assert.strictEqual(error.code, JSONRPC.Exception.NOT_AUTHORIZED);
			assert.strictEqual(error.message, "Not authorized.");
		}


		this._jsonrpcServer.addPlugin(authorizeAllPlugin);
		console.log(await client._rpc("ping", []));


		try
		{
			assert.throws(await client._rpc("throwJSONRPCException", []));
		}
		catch(error)
		{
			if(error.constructor.name==="AssertionError")
			{
				throw error;
			}
			
			assert(error instanceof JSONRPC.Exception);
			assert.strictEqual(error.code, JSONRPC.Exception.INTERNAL_ERROR);
			assert.strictEqual(error.message, "JSONRPC.Exception");
		}


		try
		{
			assert.throws(await client._rpc("throwError", []));
		}
		catch(error)
		{
			if(error.constructor.name==="AssertionError")
			{
				throw error;
			}
			
			assert(error instanceof JSONRPC.Exception);
			assert.strictEqual(error.code, 0);
			assert.strictEqual(error.message, "Error");
		}


		return client;
	}
};
