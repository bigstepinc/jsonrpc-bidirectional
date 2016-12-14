const JSONRPC = require("../index").JSONRPC;

const http = require("http");

const WebSocket = require("ws");
const WebSocketServer = WebSocket.Server;

const TestEndpoint = require("./TestEndpoint");
const ClientPluginInvalidRequestJSON = require("./ClientPluginInvalidRequestJSON");
const ServerPluginInvalidResponseJSON = require("./ServerPluginInvalidResponseJSON");
const ServerPluginAuthorizeWebSocketAndClientMultiton = require("./ServerPluginAuthorizeWebSocketAndClientMultiton");


const assert = require("assert");


module.exports =
class TestServer
{
	/**
	 * @param {boolean} bWebSocketMode
	 */
	constructor(bWebSocketMode)
	{
		// SiteA is supposedly reachable over the internet. It listens for new connections (websocket or http). 
		this._httpServerSiteA = null;
		this._webSocketServerSiteA = null;
		this._jsonrpcServerSiteA = null;
		this._jsonrpcClientSiteA = null; // reverse calls, TCP server using a JSONRPC client calls into a TCP client with an attached JSONRPC server.

		this._serverAuthenticationSkipPlugin = null;
		this._serverAuthorizeAllPlugin = null;
		this._serverPluginAuthorizeWebSocketAndClientMultitonSiteA = null;


		// SiteB does not have to be reachable (it can be firewalled, private IP or simply not listening for connections).
		// It is akin to a browser.
		this._webSocketClientSiteB = null;
		this._jsonrpcClientSiteB = null;
		this._jsonrpcServerSiteB = null; // reverse calls, TCP client using a JSONRPC server accepts requests from a TCP server with an attached JSONRPC client.


		this._bWebSocketMode = !!bWebSocketMode;

		Object.seal(this);
	}


	/**
	 * @returns {undefined}
	 */
	async runTests()
	{
		this._serverAuthenticationSkipPlugin = new JSONRPC.Plugins.Server.AuthenticationSkip();
		this._serverAuthorizeAllPlugin = new JSONRPC.Plugins.Server.AuthorizeAll();

		
		await this.triggerConnectionRefused();


		await this.setupHTTPServer();


		if(this._bWebSocketMode)
		{
			await this.setupWebsocketServerSiteA();
		}

		await this.setupClientSiteB();

		await this.endpointNotFoundError();
		await this.outsideJSONRPCPathError();

		await this.triggerAuthenticationError();
		await this.triggerAuthorizationError();

		this._jsonrpcServerSiteA.addPlugin(this._serverAuthorizeAllPlugin);
		this._jsonrpcServerSiteA.addPlugin(this._serverAuthenticationSkipPlugin);

		await this.requestParseError();
		await this.responseParseError();

		await this.callRPCMethod();

		await this.callRPCMethodWhichThrowsJSONRPCException();
		await this.callRPCMethodWhichThrowsSimpleError();

		await this.manyCallsInParallel();

		if(this._httpServerSiteA)
		{
			let fnResolveWaitClose;
			let fnRejectWaitClose;
			const promiseWaitClose = new Promise((fnResolve, fnReject) => {
				fnResolveWaitClose = fnResolve;
				fnRejectWaitClose = fnReject;
			});
			this._httpServerSiteA.close((result, error) => {
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


		if(this._webSocketServerSiteA)
		{
			let fnResolveWaitClose;
			let fnRejectWaitClose;
			const promiseWaitClose = new Promise((fnResolve, fnReject) => {
				fnResolveWaitClose = fnResolve;
				fnRejectWaitClose = fnReject;
			});
			this._webSocketServerSiteA.close((result, error) => {
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
		console.log("setupHTTPServer.");

		this._httpServerSiteA = http.createServer();
		this._jsonrpcServerSiteA = new JSONRPC.Server();

		this._jsonrpcServerSiteA.registerEndpoint(new TestEndpoint());
		this._jsonrpcServerSiteA.attachToHTTPServer(this._httpServerSiteA, "/api/");

		this._httpServerSiteA.listen(8324);
	}


	/**
	 * @returns {undefined}
	 */
	async setupWebsocketServerSiteA()
	{
		console.log("setupWebsocketServerSiteA.");

		this._webSocketServerSiteA = new WebSocketServer({
			port: 8325
		});

		this._webSocketServerSiteA.on(
			"error",
			console.error
		);


		console.log("Instantiating ServerPluginAuthorizeWebSocketAndClientMultiton on SiteA.");
		this._serverPluginAuthorizeWebSocketAndClientMultitonSiteA = new ServerPluginAuthorizeWebSocketAndClientMultiton();
		this._jsonrpcServerSiteA.addPlugin(this._serverPluginAuthorizeWebSocketAndClientMultitonSiteA);


		console.log("Instantiating JSONRPC.BidirectionalWebsocketRouter on SiteA.");
		const wsJSONRPCRouter = new JSONRPC.BidirectionalWebsocketRouter(
			/*fnConnectionIDToClientWebSocketPlugin*/ (nConnectionID) => {
				return this._serverPluginAuthorizeWebSocketAndClientMultitonSiteA.connectionIDToClientWebSocketPlugin(nConnectionID); 
			}, 
			this._jsonrpcServerSiteA
		);


		let nConnectionID = 0;
		this._webSocketServerSiteA.on(
			"connection", 
			(ws) => 
			{
				const nWebSocketConnectionID = ++nConnectionID;

				console.log("Making a new JSONRPC.Client for the new incoming connection, which is about to be passed to ServerPluginAuthorizeWebSocketAndClientMultiton.");
				const clientReverseCalls = new JSONRPC.Client(ws.upgradeReq.url);
				clientReverseCalls.addPlugin(new JSONRPC.Plugins.Client.DebugLogger());
				clientReverseCalls.addPlugin(new JSONRPC.Plugins.Client.WebSocketTransport(ws));
				
				console.log("Passing a new incoming connection to ServerPluginAuthorizeWebSocketAndClientMultiton.");
				this._serverPluginAuthorizeWebSocketAndClientMultitonSiteA.initConnection(nWebSocketConnectionID, clientReverseCalls, ws);

				ws.on(
					"message", 
					async (strMessage) => 
					{
						await wsJSONRPCRouter.routeMessage(strMessage, ws, nWebSocketConnectionID);
					}
				);
			}
		);
	}


	/**
	 * @returns {undefined}
	 */
	async setupClientSiteB()
	{
		console.log("setupClientSiteB.");
		if(this._bWebSocketMode)
		{
			if(
				this._webSocketClientSiteB
				&& this._webSocketClientSiteB.readyState === WebSocket.OPEN
			)
			{
				this._webSocketClientSiteB.close(
					/*CloseEvent.CLOSE_NORMAL*/ 1000,
					"Normal close."
				);

				this._webSocketClientSiteB = null;
			}

			this._jsonrpcClientSiteB = new JSONRPC.Client("ws://localhost:8325/api");
			this._jsonrpcClientSiteB.addPlugin(new JSONRPC.Plugins.Client.DebugLogger());

			let fnResolveWaitForOpen;
			let fnRejectWaitForOpen;
			const promiseWaitForOpen = new Promise((fnResolve, fnReject) => {
				fnResolveWaitForOpen = fnResolve;
				fnRejectWaitForOpen = fnReject;
			});

			console.log("Connecting SiteB JSONRPC client to " + this._jsonrpcClientSiteB.endpointURL + ".");
			const ws = new WebSocket(this._jsonrpcClientSiteB.endpointURL);

			ws.on("open", fnResolveWaitForOpen);
			ws.on("error", fnRejectWaitForOpen);

			await promiseWaitForOpen;

			this._webSocketClientSiteB = ws;
			this._jsonrpcClientSiteB.addPlugin(new JSONRPC.Plugins.Client.WebSocketTransport(ws));

			await this.setupWebSocketJSONRPCServerSiteB();
		}
		else
		{
			this._jsonrpcClientSiteB = new JSONRPC.Client("http://localhost:8324/api");
			this._jsonrpcClientSiteB.addPlugin(new JSONRPC.Plugins.Client.DebugLogger());
		}
	}


	/**
	 * JSONRPC server that sits on a client WebSocket connection.
	 * 
	 * @returns {undefined} 
	 */
	async setupWebSocketJSONRPCServerSiteB()
	{
		this._jsonrpcServerSiteB = new JSONRPC.Server();

		console.log("Instantiating JSONRPC.BidirectionalWebsocketRouter on SiteB.");
		const wsJSONRPCRouter = new JSONRPC.BidirectionalWebsocketRouter(
			/*connectionIDToClientWebSocketPlugin*/ (nConnectionID) => {
				for(let plugin of this._jsonrpcClientSiteB.plugins)
				{
					if(plugin instanceof JSONRPC.Plugins.Client.WebSocketTransport)
					{
						return plugin;
					}
				}
				
				throw new Error("The client must have the WebSocketTransport plugin added."); 
			}, 
			this._jsonrpcServerSiteB
		);

		this._webSocketClientSiteB.on(
			"message",
			async (strMessage) => {
				await wsJSONRPCRouter.routeMessage(strMessage, this._webSocketClientSiteB, /*nWebSocketConnectionID*/ 0);
			}
		);
	}


	/**
	 * @returns {undefined} 
	 */
	async triggerConnectionRefused()
	{
		console.log("triggerConnectionRefused");

		assert(this._httpServerSiteA === null);
		assert(this._jsonrpcServerSiteA === null);

		try
		{
			await this.setupClientSiteB();
			await this._jsonrpcClientSiteB.rpc("ping", ["pong"]);
			assert.throws(() => {});
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
			await client.rpc("ping", []);
			assert.throws(() => {});
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
			await client.rpc("ping", []);
			assert.throws(() => {});
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

		this._jsonrpcServerSiteA.addPlugin(this._serverAuthorizeAllPlugin);
		this._jsonrpcServerSiteA.removePlugin(this._serverAuthenticationSkipPlugin);
		try
		{
			await this._jsonrpcClientSiteB.rpc("ping", []);
			assert.throws(() => {});
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
		this._jsonrpcClientSiteB.addPlugin(invalidJSONPlugin);

		try
		{
			await this._jsonrpcClientSiteB.rpc("ping", []);
			assert.throws(() => {});
		}
		catch(error)
		{
			if(error.constructor.name === "AssertionError")
			{
				throw error;
			}
			
			if(this._bWebSocketMode)
			{
				await this.setupClientSiteB();
			}
			else
			{
				assert(error instanceof JSONRPC.Exception);
				assert.strictEqual(error.code, JSONRPC.Exception.PARSE_ERROR);
				assert(error.message.includes("Unexpected end of JSON input; RAW JSON string:"));
			}
		}

		this._jsonrpcClientSiteB.removePlugin(invalidJSONPlugin);
	}


	async responseParseError()
	{
		console.log("responseParseError");

		const invalidJSONPlugin = new ServerPluginInvalidResponseJSON();
		this._jsonrpcServerSiteA.addPlugin(invalidJSONPlugin);

		try
		{
			await this._jsonrpcClientSiteB.rpc("ping", []);
			assert.throws(() => {});
		}
		catch(error)
		{
			if(error.constructor.name === "AssertionError")
			{
				throw error;
			}
			
			if(this._bWebSocketMode)
			{
				await this.setupClientSiteB();
			}
			else
			{
				assert(error instanceof JSONRPC.Exception);
				assert.strictEqual(error.code, JSONRPC.Exception.INTERNAL_ERROR);
				assert(error.message.includes("Invalid error object on JSONRPC protocol response"));
			}
		}

		this._jsonrpcServerSiteA.removePlugin(invalidJSONPlugin);
	}


	/**
	 * @returns {undefined} 
	 */
	async triggerAuthorizationError()
	{
		console.log("triggerAuthorizationError");

		this._jsonrpcServerSiteA.removePlugin(this._serverAuthorizeAllPlugin);
		this._jsonrpcServerSiteA.addPlugin(this._serverAuthenticationSkipPlugin);
		try
		{
			await this._jsonrpcClientSiteB.rpc("ping", []);
			assert.throws(() => {});
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

		const strParam = "pong_" + (this._jsonrpcClientSiteB.callID);
		assert.strictEqual(strParam, await this._jsonrpcClientSiteB.rpc("ping", [strParam]));
	}


	/**
	 * @returns {undefined}
	 */
	async callRPCMethodWhichThrowsJSONRPCException()
	{
		console.log("callRPCMethodWhichThrowsJSONRPCException");

		try
		{
			await this._jsonrpcClientSiteB.rpc("throwJSONRPCException", []);
			assert.throws(() => {});
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
			await this._jsonrpcClientSiteB.rpc("throwError", []);
			assert.throws(() => {});
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
