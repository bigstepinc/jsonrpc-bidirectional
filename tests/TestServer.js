

const JSONRPC = require("../index").JSONRPC;

const http = require("http");

const WebSocket = require("ws");
const WebSocketServer = WebSocket.Server;

const TestEndpoint = require("./TestEndpoint");
const ClientPluginInvalidRequestJSON = require("./ClientPluginInvalidRequestJSON");
const ServerPluginInvalidResponseJSON = require("./ServerPluginInvalidResponseJSON");


const assert = require("assert");


module.exports =
class TestServer
{
	constructor(bWebSocketMode)
	{
		this._jsonrpcServer = null;
		this._jsonrpcClient = null;
		
		this._httpServer = null;
	
		this._authenticationSkipPlugin = null;
		this._authorizeAllPlugin = null;

		this._webSocketServer = null;
		this._webSocketClient = null;

		this._bWebSocketMode = !!bWebSocketMode;

		Object.seal(this);
	}


	/**
	 * @returns {undefined}
	 */
	async runTests()
	{
		this._authenticationSkipPlugin = new JSONRPC.Plugins.Server.AuthenticationSkip();
		this._authorizeAllPlugin = new JSONRPC.Plugins.Server.AuthorizeAll();

		
		await this.triggerConnectionRefused();


		await this.setupHTTPServer();


		if(this._bWebSocketMode)
		{
			await this.setupWebsocketServer();
		}

		await this.setupClient();

		await this.endpointNotFoundError();
		await this.outsideJSONRPCPathError();

		await this.triggerAuthenticationError();
		await this.triggerAuthorizationError();

		this._jsonrpcServer.addPlugin(this._authorizeAllPlugin);
		this._jsonrpcServer.addPlugin(this._authenticationSkipPlugin);

		await this.requestParseError();
		await this.responseParseError();

		await this.callRPCMethod();

		await this.callRPCMethodWhichThrowsJSONRPCException();
		await this.callRPCMethodWhichThrowsSimpleError();

		await this.manyCallsInParallel();

		if(this._httpServer)
		{
			let fnResolveWaitClose;
			let fnRejectWaitClose;
			const promiseWaitClose = new Promise((fnResolve, fnReject) => {
				fnResolveWaitClose = fnResolve;
				fnRejectWaitClose = fnReject;
			});
			this._httpServer.close((result, error) => {
				if(error)
				{
					fnRejectWaitClose(error);
				}
				else
				{
					fnResolveWaitClose(result);
				}
			});
			
			await promiseWaitClose;
		}


		if(this._webSocketServer)
		{
			let fnResolveWaitClose;
			let fnRejectWaitClose;
			const promiseWaitClose = new Promise((fnResolve, fnReject) => {
				fnResolveWaitClose = fnResolve;
				fnRejectWaitClose = fnReject;
			});
			this._webSocketServer.close((result, error) => {
				if(error)
				{
					fnRejectWaitClose(error);
				}
				else
				{
					fnResolveWaitClose(result);
				}
			});
			
			await promiseWaitClose;
		}
	}


	/**
	 * @returns {undefined}
	 */
	async setupHTTPServer()
	{
		this._httpServer = http.createServer();
		this._jsonrpcServer = new JSONRPC.Server();

		this._jsonrpcServer.registerEndpoint(new TestEndpoint());
		this._jsonrpcServer.attachToHTTPServer(this._httpServer, "/api/");

		this._httpServer.listen(8324);
	}


	/**
	 * @returns {undefined}
	 */
	async setupWebsocketServer()
	{
		this._webSocketServer = new WebSocketServer({
			port: 8325
		});

		this._webSocketServer.on(
			"error",
			console.error
		);
		
		const wsJSONRPCRouter = new JSONRPC.Plugins.Shared.WebSocketBidirectionalRouter(null, this._jsonrpcServer);
		this._webSocketServer.on(
			"connection", 
			(ws) => 
			{
				ws.on(
					"error",
					console.error
				);

				ws.on(
					"message", 
					async (strMessage) => 
					{
						await wsJSONRPCRouter.routeMessage(strMessage, ws);
					}
				);
			}
		);
	}


	/**
	 * @returns {undefined}
	 */
	async setupClient()
	{
		if(this._bWebSocketMode)
		{
			if(
				this._webSocketClient
				&& this._webSocketClient.readyState === WebSocket.OPEN
			)
			{
				this._webSocketClient.close(
					/*CLOSE_NORMAL*/ 1000,
					"Normal close."
				);

				this._webSocketClient = null;
			}

			this._jsonrpcClient = new JSONRPC.Client("ws://localhost:8325/api");
			this._jsonrpcClient.addPlugin(new JSONRPC.Plugins.Client.DebugLogger());

			let fnResolveWaitForOpen;
			let fnRejectWaitForOpen;
			const promiseWaitForOpen = new Promise((fnResolve, fnReject) => {
				fnResolveWaitForOpen = fnResolve;
				fnRejectWaitForOpen = fnReject;
			});

			const ws = new WebSocket(this._jsonrpcClient.endpointURL);

			ws.on("open", fnResolveWaitForOpen);
			ws.on("error", fnRejectWaitForOpen);

			await promiseWaitForOpen;

			this._webSocketClient = ws;
			this._jsonrpcClient.addPlugin(new JSONRPC.Plugins.Client.WebSocketTransport(ws));
		}
		else
		{
			this._jsonrpcClient = new JSONRPC.Client("http://localhost:8324/api");
			this._jsonrpcClient.addPlugin(new JSONRPC.Plugins.Client.DebugLogger());
		}
	}


	/**
	 * @returns {undefined} 
	 */
	async triggerConnectionRefused()
	{
		console.log("triggerConnectionRefused");

		try
		{
			await this.setupClient();
			assert.throws(await this._jsonrpcClient.rpc("ping", ["pong"]));
		}
		catch(error)
		{
			if(!this._bWebSocketMode && error.constructor.name !== "FetchError")
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
	async endpointNotFoundError()
	{
		console.log("endpointNotFoundError");

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
		console.log("outsideJSONRPCPathError");

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
		console.log("triggerAuthenticationError");

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


	async requestParseError()
	{
		console.log("requestParseError");

		const invalidJSONPlugin = new ClientPluginInvalidRequestJSON();
		this._jsonrpcClient.addPlugin(invalidJSONPlugin);

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
			
			if(this._bWebSocketMode)
			{
				await this.setupClient();
			}
			else
			{
				assert(error instanceof JSONRPC.Exception);
				assert.strictEqual(error.code, JSONRPC.Exception.PARSE_ERROR);
				assert(error.message.includes("Unexpected end of JSON input; RAW JSON string:"));
			}
		}

		this._jsonrpcClient.removePlugin(invalidJSONPlugin);
	}


	async responseParseError()
	{
		console.log("responseParseError");

		const invalidJSONPlugin = new ServerPluginInvalidResponseJSON();
		this._jsonrpcServer.addPlugin(invalidJSONPlugin);

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
			
			if(this._bWebSocketMode)
			{
				await this.setupClient();
			}
			else
			{
				assert(error instanceof JSONRPC.Exception);
				assert.strictEqual(error.code, JSONRPC.Exception.INTERNAL_ERROR);
				assert(error.message.includes("Invalid error object on JSONRPC protocol response"));
			}
		}

		this._jsonrpcServer.removePlugin(invalidJSONPlugin);
	}


	/**
	 * @returns {undefined} 
	 */
	async triggerAuthorizationError()
	{
		console.log("triggerAuthorizationError");

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
		console.log("callRPCMethod");

		const strParam = "pong_" + (this._jsonrpcClient.callID);
		assert.strictEqual(strParam, await this._jsonrpcClient.rpc("ping", [strParam]));
	}


	/**
	 * @returns {undefined}
	 */
	async callRPCMethodWhichThrowsJSONRPCException()
	{
		console.log("callRPCMethodWhichThrowsJSONRPCException");

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
		console.log("callRPCMethodWhichThrowsSimpleError");

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
		console.log("manyCallsInParallel");

		const nStartTime = (new Date()).getTime();

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
		const nCallCount = this._bWebSocketMode ? 2500 : 500;
		for(let i = 0; i < nCallCount; i++)
		{
			arrPromises.push(arrMethods[Math.round(Math.random() * (arrMethods.length - 1))].apply(this, []));
		}

		await Promise.all(arrPromises);

		console.log(nCallCount + " calls executed in " + ((new Date()).getTime() - nStartTime) + " milliseconds.");
	}
};
