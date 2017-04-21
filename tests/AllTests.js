const JSONRPC = require("..");

const http = require("http");
const url = require("url");
const path = require("path");
const fs = require("fs");

//const sleep = require("sleep-promise");

const Phantom = require("phantom");


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
		this._bPreventHTTPAPIRequests = false;

		Object.seal(this);
	}


	/**
	 * @returns {undefined}
	 */
	async runTests()
	{
		this._bPreventHTTPAPIRequests = this._bWebSocketMode;


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
			this.disableServerSecuritySiteA();
		}
		else
		{
			await this._jsonrpcClientSiteB.rpc("ImHereForTheParty", ["Hannibal", "Hannibal does the harlem shake", /*bDoNotAuthorizeMe*/ false]);
			await this._jsonrpcClientSiteC.rpc("ImHereForTheParty", ["Baracus", "Baracus does the harlem shake", /*bDoNotAuthorizeMe*/ false]);
			await this._jsonrpcClientSiteDisconnecter.rpc("ImHereForTheParty", ["Murdock", "Murdock does the harlem shake", /*bDoNotAuthorizeMe*/ false]);
		}


		await this.callRPCMethodFromWebPage();


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

		if(this._webSocketServerSiteA)
		{
			console.log("Closing WebSocket server.");
			await new Promise((fnResolve, fnReject) => {
				this._webSocketServerSiteA.close((result, error) => {
					if(error)
					{
						fnReject(error);
					}
					else
					{
						fnResolve(result);
					}
				});
			});

			this._webSocketServerSiteA = null;
		}

		if(this._httpServerSiteA)
		{
			console.log("Closing HTTP server.");
			await new Promise((fnResolve, fnReject) => {
				this._httpServerSiteA.close((result, error) => {
					if(error)
					{
						fnReject(error);
					}
					else
					{
						fnResolve(result);
					}
				});
			});
			
			this._httpServerSiteA = null;
		}


		this._bPreventHTTPAPIRequests = false;
	}


	/**
	 * @returns {undefined}
	 */
	async setupHTTPServer()
	{
		console.log("[" + process.pid + "] setupHTTPServer.");

		this._httpServerSiteA = http.createServer();
		this._jsonrpcServerSiteA = new JSONRPC.Server();

		this._jsonrpcServerSiteA.addPlugin(new ServerDebugMarkerPlugin("SiteA"));

		this._jsonrpcServerSiteA.registerEndpoint(this._testEndpoint);

		this._jsonrpcServerSiteA.attachToHTTPServer(this._httpServerSiteA, "/api/", /*bSharedWithWebSocketServer*/ this._bWebSocketMode);

		this._httpServerSiteA.on(
			"request",
			async (incomingRequest, serverResponse) => {
				// API requests are handled by the VMEndpoint instance above.

				const objParsedURL = url.parse(incomingRequest.url);
				const strFilePath = path.join(path.dirname(__dirname), objParsedURL.pathname);

				if(
					(
						objParsedURL.pathname.substr(0, "/tests/".length) === "/tests/"
						|| objParsedURL.pathname.substr(0, "/builds/".length) === "/builds/"
						|| objParsedURL.pathname.substr(0, "/node_modules/".length) === "/node_modules/"
					)
					&& incomingRequest.method === "GET"
					&& !objParsedURL.pathname.includes("..")
					&& fs.existsSync(strFilePath)
				)
				{
					console.log("[" + process.pid + "] Serving static HTTP file: " + strFilePath);

					serverResponse.statusCode = 200;
					serverResponse.write(fs.readFileSync(strFilePath));
					serverResponse.end();
					return;
				}
				else if(url.parse(incomingRequest.url).pathname.substr(0, 4) !== "/api")
				{
					console.error("[" + process.pid + "] Could not find static HTTP file: " + strFilePath);

					serverResponse.statusCode = 404;
					serverResponse.end();
					return;
				}
				else if(
					this._bPreventHTTPAPIRequests
					&& !incomingRequest.headers["sec-websocket-version"]
					&& incomingRequest.method === "POST"
					&& url.parse(incomingRequest.url).pathname.substr(0, 4) === "/api"
				)
				{
					const strError = "For these automated tests, HTTP API requests are forbidden while in WebSocket mode to correctly assess if the calls are coming through the being tested channels.";
					serverResponse.write(strError);
					serverResponse.statusCode = 500;
					serverResponse.end();
					throw new Error(strError);
				}
			}
		);

		this._httpServerSiteA.listen(8324);
	}


	/**
	 * @returns {undefined}
	 */
	async setupWebsocketServerSiteA()
	{
		console.log("[" + process.pid + "] setupWebsocketServerSiteA.");

		this._webSocketServerSiteA = new WebSocketServer({server: this._httpServerSiteA});

		this._webSocketServerSiteA.on(
			"error",
			(error) => {
				console.error(error);
				process.exit(1);
			}
		);


		console.log("[" + process.pid + "] Instantiating ServerPluginAuthorizeWebSocket on SiteA.");
		this._serverPluginAuthorizeWebSocketSiteA = new ServerPluginAuthorizeWebSocket();

		this._jsonrpcServerSiteA.addPlugin(this._serverPluginAuthorizeWebSocketSiteA);


		console.log("[" + process.pid + "] Instantiating JSONRPC.BidirectionalWebsocketRouter on SiteA.");
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

				console.log("[" + process.pid + "] Passing a new incoming connection to ServerPluginAuthorizeWebSocket.");
				this._serverPluginAuthorizeWebSocketSiteA.addConnection(nWebSocketConnectionID, webSocket);
			}
		);
	}


	/**
	 * @returns {undefined}
	 */
	async disableServerSecuritySiteA()
	{
		this._jsonrpcServerSiteA.addPlugin(this._serverAuthorizeAllPlugin);
		this._jsonrpcServerSiteA.addPlugin(this._serverAuthenticationSkipPlugin);
	}


	/**
	 * @returns {undefined}
	 */
	async setupSiteB()
	{
		console.log("[" + process.pid + "] setupSiteB.");
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

			console.log("[" + process.pid + "] Connecting SiteB JSONRPC client to " + AllTests.localEndpointWebSocket + ".");
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

			console.log("[" + process.pid + "] Instantiating JSONRPC.BidirectionalWebsocketRouter on SiteB.");
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
		console.log("[" + process.pid + "] setupSiteC.");
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

			console.log("[" + process.pid + "] Instantiating JSONRPC.BidirectionalWebsocketRouter on SiteC.");
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
		console.log("[" + process.pid + "] setupSiteDisconnecter.");
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

			console.log("[" + process.pid + "] Instantiating JSONRPC.BidirectionalWebsocketRouter on SiteDisconnecter.");
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
		console.log("[" + process.pid + "] triggerConnectionRefused");

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
		this._bPreventHTTPAPIRequests = false;


		console.log("[" + process.pid + "] endpointNotFoundError");

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


		this._bPreventHTTPAPIRequests = this._bWebSocketMode;
	}


	/**
	 * @returns {undefined} 
	 */
	async outsideJSONRPCPathError()
	{
		console.log("[" + process.pid + "] outsideJSONRPCPathError");

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
		console.log("[" + process.pid + "] triggerAuthenticationError");

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
		console.log("[" + process.pid + "] requestParseError");

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
		console.log("[" + process.pid + "] responseParseError");

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
		console.log("[" + process.pid + "] triggerAuthorizationError");

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

		console.log("[" + process.pid + "] callRPCMethodSiteB");

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

		console.log("[" + process.pid + "] callRPCMethodSiteC");

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
		console.log("[" + process.pid + "] callRPCMethodSiteDisconnecter");

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

		console.log("[" + process.pid + "] callRPCMethodNonBidirectionalClient");

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
		console.log("[" + process.pid + "] callRPCMethodSiteBWhichThrowsJSONRPCException");

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
		console.log("[" + process.pid + "] callRPCMethodSiteBWhichThrowsSimpleError");

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


	async callRPCMethodFromWebPage()
	{
		assert(fs.existsSync(path.resolve(path.dirname(__dirname) + "/builds/browser/es5/jsonrpc.min.js")));
		assert(fs.existsSync(path.resolve(__dirname + "/Browser/index.html")));

		const phantom = await Phantom.create(
			[],
			{
				logger: console,
				logLevel: "error" // error | debug
			}
		);

		const phantomPage = await phantom.createPage();
		await phantomPage.setting("javascriptEnabled", true);


		this._testEndpoint.nWaitForWebPageRemainingCallsCount = this._bWebSocketMode ? 3 : 1;

		let nTimeoutIDWaitForWebPage = null;
		const promiseWaitForWebPage = new Promise((fnResolve, fnReject) => {
			nTimeoutIDWaitForWebPage = setTimeout(
				async () => {
					this._testEndpoint.fnResolveWaitForWebPage = null;

					console.log(
						await phantomPage.evaluate(
							function() {
								return window.arrErrors;
							}
						)
					);

					fnReject(new Error("Timed out waiting for webpage JSONRPC call to TestEndpoint.ping()."));
				},
				7000 /*milliseconds*/
			);

			this._testEndpoint.fnResolveWaitForWebPage = fnResolve;
		});

		
		const strStatus = await phantomPage.open(`http://localhost:8324/tests/Browser/index.html?websocketmode=${this._bWebSocketMode ? 1 : 0}`.replace(/\\+/g, "/").replace(/^\//, ""));
		console.log("[" + process.pid + "] Phantom page open: " + strStatus);
		assert.strictEqual(strStatus, "success");

		//phantom.process.stdout.pipe(process.stdout);
		//phantom.process.stderr.pipe(process.stderr);

		//const strContent = await phantomPage.property("content");
		//console.log(strContent);


		/**
			Now waiting for these events (each will decrement this._testEndpoint.nWaitForWebPageRemainingCallsCount)
			1) Simple call ffrom a stand alone JSONRPC client in the browser, towards node.
		*/

		/**
		 	If in websocket mode:
		
			2) Another call, on a different connection, from a JSONRPC client instantiated by BidirectionalWebsocketRouter in the browser.
			Exactly this call from browser to node: ping("Calling from html es5 client, bidirectional websocket mode.");
		
			3) node's ping will call browser ping: await incomingRequest.reverseCallsClient.rpc("ping", [strATeamCharacterName + " called back to confirm this: " + strReturn + "!", false, "CallMeBackOnceAgain"]);
			Where the character name is "CallMeBackOnceAgain".

			4) If the browser ping sees "CallMeBackOnceAgain" as value, it will make one last call to node's ping, without any special params (preventing an infinite loop).
		*/


		await promiseWaitForWebPage;
		if(nTimeoutIDWaitForWebPage !== null)
		{
			clearTimeout(nTimeoutIDWaitForWebPage);
		}
		assert(this._testEndpoint.nWaitForWebPageRemainingCallsCount === 0, "Remaining ping calls count: " + this._testEndpoint.nWaitForWebPageRemainingCallsCount);


		await phantom.exit();
		

		console.log("[" + process.pid + "] Calling from the webpage worked!");
	}


	/**
	 * @returns {undefined} 
	 */
	async manyCallsInParallel()
	{
		console.log("[" + process.pid + "] manyCallsInParallel");

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
		console.log("[" + process.pid + "] Connecting WebSocket to " + AllTests.localEndpointWebSocket + ".");
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
		return "ws://localhost:8324/api";
	}
};
