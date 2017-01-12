const JSONRPC = require("../index");

const http = require("http");


// @TODO: Test with https://github.com/uWebSockets/uWebSockets as well. They claim magnitudes of extra performance (memory, CPU, network connections).
// Read first: https://github.com/uWebSockets/uWebSockets#deviations-from-ws
// @TODO: Test with other WebSocket implementations.

const WebSocket = require("ws");
const WebSocketServer = WebSocket.Server;


const TestEndpoint = require("./TestEndpoint");
const TestClient = require("./TestClient");
const ClientPluginInvalidRequestJSON = require("./ClientPluginInvalidRequestJSON");
const ServerPluginInvalidResponseJSON = require("./ServerPluginInvalidResponseJSON");
const ServerPluginAuthorizeWebSocket = require("./ServerPluginAuthorizeWebSocket");
const ServerDebugMarkerPlugin = require("./ServerDebugMarkerPlugin");
const ClientDebugMarkerPlugin = require("./ClientDebugMarkerPlugin");

const assert = require("assert");


module.exports =
class AllTests
{
	/**
	 * @param {boolean} bWebSocketMode
	 */
	constructor(bWebSocketMode)
	{
		this._testEndpoint = new TestEndpoint();

		// SiteA is supposedly reachable over the internet. It listens for new connections (websocket or http). 
		this._httpServerSiteA = null;
		this._webSocketServerSiteA = null;
		this._jsonrpcServerSiteA = null;
		this._serverPluginAuthorizeWebSocketSiteA = null;


		// SiteB does not have to be reachable (it can be firewalled, private IP or simply not listening for connections).
		// It is akin to a browser.
		this._webSocketClientSiteB = null;
		this._jsonrpcClientSiteB = null;
		this._jsonrpcServerSiteB = null; // reverse calls, TCP client using a JSONRPC server accepts requests from a TCP server with an attached JSONRPC client.


		// SiteC does not have to be reachable (it can be firewalled, private IP or simply not listening for connections).
		// It is akin to a browser.
		this._webSocketClientSiteC = null;
		this._jsonrpcClientSiteC = null;
		this._jsonrpcServerSiteC = null; // reverse calls, TCP client using a JSONRPC server accepts requests from a TCP server with an attached JSONRPC client.


		// SiteDisconnecter does not have to be reachable (it can be firewalled, private IP or simply not listening for connections).
		// It is akin to a browser.
		this._webSocketClientSiteDisconnecter = null;
		this._jsonrpcClientSiteDisconnecter = null;
		this._jsonrpcServerSiteDisconnecter = null; // reverse calls, TCP client using a JSONRPC server accepts requests from a TCP server with an attached JSONRPC client.

		
		// JSONRPC client on WebSocket client, nothing else.
		this._jsonrpcClientNonBidirectional = null;
		

		// Used by SiteB and SiteC, which trusts the remote server based on SSL certificates.
		this._serverAuthenticationSkipPlugin = new JSONRPC.Plugins.Server.AuthenticationSkip();
		this._serverAuthorizeAllPlugin = new JSONRPC.Plugins.Server.AuthorizeAll();


		this._bWebSocketMode = !!bWebSocketMode;

		Object.seal(this);
	}


	/**
	 * @returns {undefined}
	 */
	async runTests()
	{
		await this.triggerConnectionRefused();


		await this.setupHTTPServer();


		if(this._bWebSocketMode)
		{
			await this.setupWebsocketServerSiteA();
		}

		await this.setupSiteB();
		await this.setupSiteC();
		await this.setupSiteDisconnecter();

		await this.endpointNotFoundError();
		await this.outsideJSONRPCPathError();

		await this.triggerAuthenticationError();
		await this.triggerAuthorizationError();

		await this.requestParseError();
		await this.responseParseError();

		if(!this._bWebSocketMode)
		{
			this._jsonrpcServerSiteA.addPlugin(this._serverAuthorizeAllPlugin);
			this._jsonrpcServerSiteA.addPlugin(this._serverAuthenticationSkipPlugin);
		}
		else
		{
			await this._jsonrpcClientSiteB.rpc("ImHereForTheParty", ["Hannibal", "Hannibal does the harlem shake", /*bDoNotAuthorizeMe*/ false]);
			await this._jsonrpcClientSiteC.rpc("ImHereForTheParty", ["Baracus", "Baracus does the harlem shake", /*bDoNotAuthorizeMe*/ false]);
			await this._jsonrpcClientSiteDisconnecter.rpc("ImHereForTheParty", ["Murdock", "Murdock does the harlem shake", /*bDoNotAuthorizeMe*/ false]);
		}

		await this.callRPCMethodSiteB(/*bDoNotSleep*/ true);
		await this.callRPCMethodSiteB(/*bDoNotSleep*/ true, /*bVeryLargePayload*/ true);

		if(this._bWebSocketMode)
		{
			await this.callRPCMethodSiteDisconnecter();
			await this.setupSiteDisconnecter();
			await this._jsonrpcClientSiteDisconnecter.rpc("ImHereForTheParty", ["Murdock", "Murdock does the harlem shake", /*bDoNotAuthorizeMe*/ false]);
			await this.callRPCMethodSiteDisconnecter(/*bTerminate*/ true);

		}

		await this.callRPCMethodSiteBWhichThrowsJSONRPCException();
		await this.callRPCMethodSiteBWhichThrowsSimpleError();

		await this.callRPCMethodNonBidirectionalClient();

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

		this._jsonrpcServerSiteA.addPlugin(new ServerDebugMarkerPlugin("SiteA"));

		this._jsonrpcServerSiteA.registerEndpoint(this._testEndpoint);
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
			(error) => {
				console.log(error);
				process.exit(1);
			}
		);


		console.log("Instantiating ServerPluginAuthorizeWebSocket on SiteA.");
		this._serverPluginAuthorizeWebSocketSiteA = new ServerPluginAuthorizeWebSocket();

		this._jsonrpcServerSiteA.addPlugin(this._serverPluginAuthorizeWebSocketSiteA);


		console.log("Instantiating JSONRPC.BidirectionalWebsocketRouter on SiteA.");
		const wsJSONRPCRouter = new JSONRPC.BidirectionalWebsocketRouter(this._jsonrpcServerSiteA);

		wsJSONRPCRouter.on(
			"madeReverseCallsClient",
			(clientReverseCalls) => {
				clientReverseCalls.addPlugin(new JSONRPC.Plugins.Client.DebugLogger());
				clientReverseCalls.addPlugin(new ClientDebugMarkerPlugin("SiteA; reverse calls;"));				
			}
		);

		this._webSocketServerSiteA.on(
			"connection", 
			async (webSocket) => 
			{
				const nWebSocketConnectionID = await wsJSONRPCRouter.addWebSocket(webSocket);

				console.log("Passing a new incoming connection to ServerPluginAuthorizeWebSocket.");
				this._serverPluginAuthorizeWebSocketSiteA.addConnection(nWebSocketConnectionID, webSocket);
			}
		);
	}


	/**
	 * @returns {undefined}
	 */
	async setupSiteB()
	{
		console.log("setupSiteB.");
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

			console.log("Connecting SiteB JSONRPC client to " + AllTests.localEndpointWebSocket + ".");
			const ws = new WebSocket(AllTests.localEndpointWebSocket);
			await new Promise((fnResolve, fnReject) => {
				ws.on("open", fnResolve);
				ws.on("error", fnReject);
			});

			this._webSocketClientSiteB = ws;

			this._jsonrpcServerSiteB = new JSONRPC.Server();
			this._jsonrpcServerSiteB.registerEndpoint(new TestEndpoint());

			this._jsonrpcServerSiteB.addPlugin(this._serverAuthenticationSkipPlugin);
			this._jsonrpcServerSiteB.addPlugin(this._serverAuthorizeAllPlugin);
			this._jsonrpcServerSiteB.addPlugin(new ServerDebugMarkerPlugin("SiteB"));

			console.log("Instantiating JSONRPC.BidirectionalWebsocketRouter on SiteB.");
			const wsJSONRPCRouter = new JSONRPC.BidirectionalWebsocketRouter(
				this._jsonrpcServerSiteB
			);

			const nWebSocketConnectionID = await wsJSONRPCRouter.addWebSocket(this._webSocketClientSiteB);

			// Alternatively, the madeReverseCallsClient event can be used.
			// In this case however, only a single client is suposed to exist.
			this._jsonrpcClientSiteB = wsJSONRPCRouter.connectionIDToSingletonClient(nWebSocketConnectionID, TestClient);
			this._jsonrpcClientSiteB.addPlugin(new ClientDebugMarkerPlugin("SiteB"));
			this._jsonrpcClientSiteB.addPlugin(new JSONRPC.Plugins.Client.DebugLogger());
		}
		else
		{
			this._jsonrpcClientSiteB = new TestClient("http://localhost:8324/api");
			this._jsonrpcClientSiteB.addPlugin(new ClientDebugMarkerPlugin("SiteB"));
			this._jsonrpcClientSiteB.addPlugin(new JSONRPC.Plugins.Client.DebugLogger());
		}
	}


	/**
	 * @returns {undefined}
	 */
	async setupSiteC()
	{
		console.log("setupSiteC.");
		if(this._bWebSocketMode)
		{
			if(
				this._webSocketClientSiteC
				&& this._webSocketClientSiteC.readyState === WebSocket.OPEN
			)
			{
				this._webSocketClientSiteC.close(
					/*CloseEvent.CLOSE_NORMAL*/ 1000,
					"Normal close."
				);

				this._webSocketClientSiteC = null;
			}

			this._webSocketClientSiteC = await this._makeClientWebSocket();

			this._jsonrpcServerSiteC = new JSONRPC.Server();
			this._jsonrpcServerSiteC.registerEndpoint(new TestEndpoint());

			this._jsonrpcServerSiteC.addPlugin(this._serverAuthenticationSkipPlugin);
			this._jsonrpcServerSiteC.addPlugin(this._serverAuthorizeAllPlugin);
			this._jsonrpcServerSiteC.addPlugin(new ServerDebugMarkerPlugin("SiteC"));

			console.log("Instantiating JSONRPC.BidirectionalWebsocketRouter on SiteC.");
			const wsJSONRPCRouter = new JSONRPC.BidirectionalWebsocketRouter(
				this._jsonrpcServerSiteC
			);

			const nWebSocketConnectionID = await wsJSONRPCRouter.addWebSocket(this._webSocketClientSiteC);

			// Alternatively, the madeReverseCallsClient event can be used.
			// In this case however, only a single client is suposed to exist.
			this._jsonrpcClientSiteC = wsJSONRPCRouter.connectionIDToSingletonClient(nWebSocketConnectionID, TestClient);
			this._jsonrpcClientSiteC.addPlugin(new ClientDebugMarkerPlugin("SiteC"));
			this._jsonrpcClientSiteC.addPlugin(new JSONRPC.Plugins.Client.DebugLogger());
		}
		else
		{
			this._jsonrpcClientSiteC = new TestClient("http://localhost:8324/api");
			this._jsonrpcClientSiteC.addPlugin(new ClientDebugMarkerPlugin("SiteC"));
			this._jsonrpcClientSiteC.addPlugin(new JSONRPC.Plugins.Client.DebugLogger());
		}
	}


	/**
	 * @returns {undefined}
	 */
	async setupSiteDisconnecter()
	{
		console.log("setupSiteDisconnecter.");
		if(this._bWebSocketMode)
		{
			if(
				this._webSocketClientSiteDisconnecter
				&& this._webSocketClientSiteDisconnecter.readyState === WebSocket.OPEN
			)
			{
				this._webSocketClientSiteDisconnecter.close(
					/*CloseEvent.CLOSE_NORMAL*/ 1000,
					"Normal close."
				);

				this._webSocketClientSiteDisconnecter = null;
			}

			this._webSocketClientSiteDisconnecter = await this._makeClientWebSocket();

			this._jsonrpcServerSiteDisconnecter = new JSONRPC.Server();
			this._jsonrpcServerSiteDisconnecter.registerEndpoint(new TestEndpoint());

			this._jsonrpcServerSiteDisconnecter.addPlugin(this._serverAuthenticationSkipPlugin);
			this._jsonrpcServerSiteDisconnecter.addPlugin(this._serverAuthorizeAllPlugin);
			this._jsonrpcServerSiteDisconnecter.addPlugin(new ServerDebugMarkerPlugin("SiteDisconnecter"));

			console.log("Instantiating JSONRPC.BidirectionalWebsocketRouter on SiteDisconnecter.");
			const wsJSONRPCRouter = new JSONRPC.BidirectionalWebsocketRouter(
				this._jsonrpcServerSiteDisconnecter
			);

			const nWebSocketConnectionID = await wsJSONRPCRouter.addWebSocket(this._webSocketClientSiteDisconnecter);

			// Alternatively, the madeReverseCallsClient event can be used.
			// In this case however, only a single client is suposed to exist.
			this._jsonrpcClientSiteDisconnecter = wsJSONRPCRouter.connectionIDToSingletonClient(nWebSocketConnectionID, TestClient);
			this._jsonrpcClientSiteDisconnecter.addPlugin(new ClientDebugMarkerPlugin("SiteDisconnecter"));
			this._jsonrpcClientSiteDisconnecter.addPlugin(new JSONRPC.Plugins.Client.DebugLogger());
		}
		else
		{
			this._jsonrpcClientSiteDisconnecter = new TestClient("http://localhost:8324/api");
			this._jsonrpcClientSiteDisconnecter.addPlugin(new ClientDebugMarkerPlugin("SiteDisconnecter"));
			this._jsonrpcClientSiteDisconnecter.addPlugin(new JSONRPC.Plugins.Client.DebugLogger());
		}
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
			await this.setupSiteB();
			await this._jsonrpcClientSiteB.rpc("ping", ["triggerConnectionRefused", /*bRandomSleep*/ false]);
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

		const client = new TestClient("http://localhost:8324/api/bad-endpoint-path");
		client.addPlugin(new ClientDebugMarkerPlugin("SiteB"));
		client.addPlugin(new JSONRPC.Plugins.Client.DebugLogger());

		try
		{
			await client.rpc("ping", ["endpointNotFoundError", /*bRandomSleep*/ false]);
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

		const client = new TestClient("http://localhost:8324/unhandled-path");
		client.addPlugin(new ClientDebugMarkerPlugin("SiteB"));
		client.addPlugin(new JSONRPC.Plugins.Client.DebugLogger());

		try
		{
			await client.rpc("ping", ["outsideJSONRPCPathError", /*bRandomSleep*/ false]);
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

		try
		{
			await this._jsonrpcClientSiteB.rpc("ping", ["triggerAuthenticationError", /*bRandomSleep*/ false]);
			assert.throws(() => {});
		}
		catch(error)
		{
			if(error.constructor.name === "AssertionError")
			{
				throw error;
			}
			
			//console.log(error);
			assert(error instanceof JSONRPC.Exception);
			assert.strictEqual(error.code, JSONRPC.Exception.NOT_AUTHENTICATED);
			assert.strictEqual(error.message, "Not authenticated.");
		}
	}


	/**
	 * @returns {undefined}
	 */
	async requestParseError()
	{
		console.log("requestParseError");

		const invalidJSONPlugin = new ClientPluginInvalidRequestJSON();
		this._jsonrpcClientSiteB.addPlugin(invalidJSONPlugin);

		try
		{
			await this._jsonrpcClientSiteB.rpc("ping", ["requestParseError", /*bRandomSleep*/ false]);
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
				await this.setupSiteB();
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


	/**
	 * @returns {undefined}
	 */
	async responseParseError()
	{
		console.log("responseParseError");

		const invalidJSONPlugin = new ServerPluginInvalidResponseJSON();
		this._jsonrpcServerSiteA.addPlugin(invalidJSONPlugin);

		try
		{
			await this._jsonrpcClientSiteB.rpc("ping", ["responseParseError", /*bRandomSleep*/ false]);
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
				await this.setupSiteB();
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

		if(this._bWebSocketMode)
		{
			await this._jsonrpcClientSiteB.rpc("ImHereForTheParty", ["Hannibal", "Hannibal does the harlem shake", /*bDoNotAuthorizeMe*/ true]);
		}
		else
		{
			this._jsonrpcServerSiteA.removePlugin(this._serverAuthorizeAllPlugin);
			this._jsonrpcServerSiteA.addPlugin(this._serverAuthenticationSkipPlugin);
		}

		try
		{
			await this._jsonrpcClientSiteB.rpc("ping", ["triggerAuthorizationError", /*bRandomSleep*/ false]);
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
	 * @param {boolean} bDoNotSleep
	 * @param {boolean|undefined} bVeryLargePayload
	 * 
	 * @returns {undefined}
	 */
	async callRPCMethodSiteB(bDoNotSleep, bVeryLargePayload)
	{
		const bRandomSleep = !bDoNotSleep;
		bVeryLargePayload = !!bVeryLargePayload;

		console.log("callRPCMethodSiteB");

		let strParam = "pong_" + (this._jsonrpcClientSiteB.callID);

		if(bVeryLargePayload)
		{
			let nIterator = 0;
			while(strParam.length < 10 * 1024 * 1024 /*10 MB*/)
			{
				strParam += strParam + "_" + (++nIterator);
			}
		}

		const arrParams = [strParam, bRandomSleep];

		if(this._bWebSocketMode)
		{
			arrParams.push("Hannibal");
		}

		assert.strictEqual(strParam, await this._jsonrpcClientSiteB.rpc("ping", arrParams));
	}


	/**
	 * @param {boolean} bDoNotSleep
	 * 
	 * @returns {undefined}
	 */
	async callRPCMethodSiteC(bDoNotSleep)
	{
		const bRandomSleep = !bDoNotSleep;

		console.log("callRPCMethodSiteC");

		const strParam = "pong_" + (this._jsonrpcClientSiteC.callID);
		const arrParams = [strParam, bRandomSleep];

		if(this._bWebSocketMode)
		{
			arrParams.push("Baracus");
		}

		assert.strictEqual(strParam, await this._jsonrpcClientSiteC.rpc("ping", arrParams));
	}


	/**
	 * @param {boolean} bTerminate
	 * 
	 * @returns {undefined}
	 */
	async callRPCMethodSiteDisconnecter(bTerminate)
	{
		console.log("callRPCMethodSiteDisconnecter");

		bTerminate = !!bTerminate;

		try
		{
			await this._jsonrpcClientSiteDisconnecter.rpc(bTerminate ? "terminateConnection" : "closeConnection", []);
			assert.throws(() => {});
		}
		catch(error)
		{
			if(error.constructor.name === "AssertionError")
			{
				throw error;
			}
			
			assert(error instanceof Error, error.constructor.name);
			assert(error.message.startsWith("WebSocket closed"));

			if(bTerminate)
			{
				assert(error.message.includes("Code: 1006" /*CLOSE_ABNORMAL*/));
			}
			else
			{
				assert(error.message.includes("Code: 1011" /*Internal error. (TestEndpoint specifies 1011 close event error code)*/));
			}
		}
	}


	/**
	 * @param {boolean} bDoNotSleep
	 * 
	 * @returns {undefined}
	 */
	async callRPCMethodNonBidirectionalClient(bDoNotSleep)
	{
		if(!this._bWebSocketMode)
		{
			return;
		}

		console.log("callRPCMethodNonBidirectionalClient");

		const bRandomSleep = !bDoNotSleep;


		if(this._jsonrpcClientNonBidirectional === null)
		{
			const webSocket = await this._makeClientWebSocket();

			this._jsonrpcClientNonBidirectional = new TestClient(AllTests.localEndpointWebSocket);
			this._jsonrpcClientNonBidirectional.addPlugin(new ClientDebugMarkerPlugin("NonBidirectionalClient"));
			this._jsonrpcClientNonBidirectional.addPlugin(new JSONRPC.Plugins.Client.DebugLogger());
			
			const webSocketTransport = new JSONRPC.Plugins.Client.WebSocketTransport(webSocket);
			this._jsonrpcClientNonBidirectional.addPlugin(webSocketTransport);

			await this._jsonrpcClientNonBidirectional.rpc("ImHereForTheParty", ["Face", "Face does the harlem shake", /*bDoNotAuthorizeMe*/ false]);
		}
		
		const strParam = "pong_one_way";
		const arrParams = [strParam, bRandomSleep];

		assert.strictEqual(strParam, await this._jsonrpcClientNonBidirectional.rpc("ping", arrParams));
	}


	/**
	 * @returns {undefined}
	 */
	async callRPCMethodSiteBWhichThrowsJSONRPCException()
	{
		console.log("callRPCMethodSiteBWhichThrowsJSONRPCException");

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
	async callRPCMethodSiteBWhichThrowsSimpleError()
	{
		console.log("callRPCMethodSiteBWhichThrowsSimpleError");

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
			this.callRPCMethodSiteB,
			this.callRPCMethodSiteC,
			this.callRPCMethodNonBidirectionalClient,

			this.callRPCMethodSiteBWhichThrowsSimpleError,
			this.callRPCMethodSiteBWhichThrowsJSONRPCException,
			
			this.callRPCMethodSiteC,

			this.callRPCMethodNonBidirectionalClient,
			this.callRPCMethodNonBidirectionalClient,

			this.callRPCMethodSiteB,
			this.callRPCMethodSiteB
		];

		// http://smallvoid.com/article/winnt-tcpip-max-limit.html
		// https://blog.jayway.com/2015/04/13/600k-concurrent-websocket-connections-on-aws-using-node-js/
		// http://stackoverflow.com/questions/17033631/node-js-maxing-out-at-1000-concurrent-connections
		const nCallCount = this._bWebSocketMode ? 2000 : 500;
		for(let i = 0; i < nCallCount; i++)
		{
			arrPromises.push(arrMethods[Math.round(Math.random() * (arrMethods.length - 1))].apply(this, []));
		}

		await Promise.all(arrPromises);

		console.log(nCallCount + " calls executed in " + ((new Date()).getTime() - nStartTime) + " milliseconds.");
	}


	/**
	 * @returns {WebSocket}
	 */
	async _makeClientWebSocket()
	{
		console.log("Connecting WebSocket to " + AllTests.localEndpointWebSocket + ".");
		const webSocket = new WebSocket(AllTests.localEndpointWebSocket);
		await new Promise((fnResolve, fnReject) => {
			webSocket.on("open", fnResolve);
			webSocket.on("error", fnReject);
		});

		return webSocket;
	}


	/**
	 * @returns {string}
	 */
	static get localEndpointWebSocket()
	{
		return "ws://localhost:8325/api";
	}
};
