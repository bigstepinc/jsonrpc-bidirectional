const JSONRPC = require("../..");

const exec = require("child_process").exec;

const http = require("http");
const url = require("url");
const path = require("path");
const fs = require("fs");
const os = require("os");

const sleep = require("sleep-promise");

const Phantom = require("phantom");

const cluster = require("cluster");

const querystring = require("querystring");
// @TODO: Test with other WebSocket implementations.


const Tests = {};
Tests.Plugins = {};
Tests.Plugins.Client = {};
Tests.Plugins.Server = {};

const TestEndpoint = require("./TestEndpoint");
const TestClient = require("./TestClient");
Tests.Plugins.Client.InvalidRequestJSON = require("./Plugins/Client/InvalidRequestJSON");
Tests.Plugins.Server.InvalidResponseJSON = require("./Plugins/Server/InvalidResponseJSON");
Tests.Plugins.Server.WebSocketAuthorize = require("./Plugins/Server/WebSocketAuthorize");
Tests.Plugins.Server.DebugMarker = require("./Plugins/Server/DebugMarker");
Tests.Plugins.Client.DebugMarker = require("./Plugins/Client/DebugMarker");

const assert = require("assert");


module.exports =
class AllTests
{
	/**
	 * @param {boolean} bBenchmarkMode
	 * @param {boolean} bWebSocketMode
	 * @param {Class|undefined} classWebSocket
	 * @param {Class|undefined} classWebSocketServer
	 * @param {Class|undefined} classWebSocketAdapter
	 * @param {boolean|undefined} bDisableVeryLargePacket
	 */
	constructor(bBenchmarkMode, bWebSocketMode, classWebSocket, classWebSocketServer, classWebSocketAdapter, bDisableVeryLargePacket)
	{
		// uws hangs on .close(), ws doesn't.
		// Without the await, the process will exit just fine on Windows 10, 64 bit.
		// On Travis (Linux) it throws segmentation fault.
		this.bAwaitServerClose = os.platform() !== "win32";

		this._bBenchmarkMode = bBenchmarkMode;
		this.savedConsole = null;
		this._classWebSocket = classWebSocket;
		this._classWebSocketServer = classWebSocketServer;
		this._classWebSocketAdapter = classWebSocketAdapter;
		this._bDisableVeryLargePacket = !!bDisableVeryLargePacket;

		this._testEndpoint = new TestEndpoint(this._bBenchmarkMode || !this._bWebSocketMode);

		// SiteA is supposedly reachable over the internet. It listens for new connections (websocket or http).
		this._httpServerSiteA = null;
		this._webSocketServerSiteA = null;
		this._jsonrpcServerSiteA = null;
		this._webSocketAuthorizeSiteA = null;


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

		let objRandomURLPublicConfig = this.urlPublicConfig;
		this._serverURLPublicPlugin = new JSONRPC.Plugins.Server.URLPublic(
			objRandomURLPublicConfig.encryptionKeys,
			objRandomURLPublicConfig.activeKeyIndex,
			objRandomURLPublicConfig.salt,
			objRandomURLPublicConfig.compressionType
		);

		this._bWebSocketMode = !!bWebSocketMode;
		this._bPreventHTTPAPIRequests = false;

		this._nHTTPPort = 8234;
		this._nWebSocketsPort = this._nHTTPPort;

		this._strBindIPAddress = "127.0.0.1";

		Object.seal(this);
	}


	/**
	 * @param {number} nPort
	 */
	set httpServerPort(nPort)
	{
		this._nHTTPPort = nPort;
	}


	/**
	 * @returns {number}
	 */
	get httpServerPort()
	{
		return this._nHTTPPort;
	}


	/**
	 * @param {number} nPort
	 */
	set websocketServerPort(nPort)
	{
		this._nWebSocketsPort = nPort;
	}


	/**
	 * @returns {number}
	 */
	get websocketServerPort()
	{
		return this._nWebSocketsPort;
	}

	get urlPublicConfig()
	{
		if(typeof this._objURLPublicConfig === "undefined" || this._objURLPublicConfig === null)
		{
			let strActiveKeyIndex = "re";

			this._objURLPublicConfig = {
				activeKeyIndex: strActiveKeyIndex,
				encryptionKeys: {
					[strActiveKeyIndex]: "hfkaisksua9812u98n191fuo9ofn9of9"
				},
				salt: "thisisthesupersecretsaltfortheencryptedrequest",
				compressionType: JSONRPC.Plugins.Server.URLPublic.COMPRESSION_TYPE_ZLIB
				// compressionType: JSONRPC.Plugins.Server.URLPublic.COMPRESSION_TYPE_BROTLI
			};
		}

		return this._objURLPublicConfig;
	}


	/**
	 * @returns {undefined}
	 */
	async urlPublicRequestSignatureAndIV()
	{
		const arrInputs = [
			this.generateRandomString(16), //Normal random string
			this.generateRandomString(50, "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-={}|[]\\<>?,./:\";'~`"), //Special characters
			this.generateRandomString(255), //Long random string
			this.generateRandomString(1000) //Extra long random string
		];

		for(let strInputString of arrInputs)
		{
			let bufferIV1 = this._serverURLPublicPlugin.JSONRequestSignatureAndIV(strInputString);
			let bufferIV2 = this._serverURLPublicPlugin.JSONRequestSignatureAndIV(strInputString);

			assert(bufferIV1.equals(bufferIV2), `[FAILED] test_URLPublic_JSONRequestSignatureAndIV: buffers not equal for string input ${strInputString}`);
		}

		console.log(`[${process.pid}] [OK] urlPublicRequestSignatureAndIV`);
	}

	/**
	 * @returns {undefined}
	 */
	async urlPublicRequestGenerate()
	{
		const strEndpointURL = `http://${this._strBindIPAddress}:${this._nHTTPPort}/api/url`;
		const strFunctionName = "test_echo";
		const arrParams = [1, "foo", "bar"];
		const nExpireSeconds = 100;

		for(let nEncryptionMode of this._serverURLPublicPlugin.allowedEncryptionModes)
		{
			let strEncryptedURL = await this._serverURLPublicPlugin.URLRequestGenerate(strEndpointURL, strFunctionName, arrParams, nExpireSeconds, nEncryptionMode);
			console.log(`[${process.pid}] Encrypted URL with encryption mode ${nEncryptionMode}: ${strEncryptedURL}`);

			let strQueryString = strEncryptedURL.split("?")[1];

			let strJSONDecryptedURLRequest = await this._serverURLPublicPlugin.PublicURLParamsToJSONRequest(querystring.parse(strQueryString));
			console.log(`[${process.pid}] Decrypted URL with encryption mode ${nEncryptionMode}: ${strJSONDecryptedURLRequest}`);

			let objDecryptedURLRequest = JSON.parse(strJSONDecryptedURLRequest);

			assert(
				objDecryptedURLRequest[JSONRPC.Plugins.Server.URLPublic.REQUEST_PARAM_NAME_METHOD] === strFunctionName,
				`Invalid method value for decrypted request URL. Encryption mode: ${nEncryptionMode}`
			);

			for(let nParamIndex in arrParams)
			{
				assert(
					objDecryptedURLRequest[JSONRPC.Plugins.Server.URLPublic.REQUEST_PARAM_NAME_PARAMS][nParamIndex] === arrParams[nParamIndex],
					`Invalid parameters for decrypted request URL. Encryption mode: ${nEncryptionMode}`
				);
			}

			assert(
				(objDecryptedURLRequest[JSONRPC.Plugins.Server.URLPublic.REQUEST_PARAM_NAME_EXPIRE] <= parseInt(((new Date()).getTime() / 1000), 10) + nExpireSeconds),
				`Invalid expire value for decrypted request URL. Encryption mode: ${nEncryptionMode}`
			);

			console.log(`[${process.pid}] [OK] urlPublicRequestGenerate Encryption mode: ${nEncryptionMode}`);
		}
	}


	/**
	 * Generates a random string of the given length from the char set.
	 *
	 * @param {Integer} nLength
	 * @param {string} arrCharSet
	 *
	 * @returns {string}
	 */
	generateRandomString(nLength = 16, arrCharSet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789")
	{
		let strResult = "";
		let nCharSetLength = arrCharSet.length;

		for (let i = 0; i < nLength; i++)
		{
			strResult += arrCharSet.charAt(Math.floor(Math.random() * nCharSetLength));
		}

		return strResult;
	}


	/**
	 * @returns {undefined}
	 */
	async runTests()
	{
		assert(cluster.isMaster, "Expecting cluster.isMaster to be true.");

		if(this._bBenchmarkMode)
		{
			this.disableConsole();
		}

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
		await this.callRPCMethodSiteB(/*bDoNotSleep*/ true, /*bNotification*/ true);
		await this.callRPCMethodSiteB(/*bDoNotSleep*/ true, /*bNotification*/ false, /*bVeryLargePayload*/ true);
		await this.callRPCMethodSiteB(/*bDoNotSleep*/ true, /*bNotification*/ true);
		await this.callRPCMethodSiteB(/*bDoNotSleep*/ true, /*bNotification*/ true);


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
			if(
				this._webSocketClientSiteB
				&& this._webSocketClientSiteB.readyState === JSONRPC.WebSocketAdapters.WebSocketWrapperBase.OPEN
			)
			{
				this._webSocketClientSiteB.close(
					/*CloseEvent.CLOSE_NORMAL*/ 1000,
					"Normal close."
				);

				this._webSocketClientSiteB = null;
			}

			if(
				this._webSocketClientSiteC
				&& this._webSocketClientSiteC.readyState === JSONRPC.WebSocketAdapters.WebSocketWrapperBase.OPEN
			)
			{
				this._webSocketClientSiteC.close(
					/*CloseEvent.CLOSE_NORMAL*/ 1000,
					"Normal close."
				);

				this._webSocketClientSiteC = null;
			}


			console.log("Closing WebSocket server.");
			const awaitWebSocketServerClose = new Promise((fnResolve, fnReject) => {
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

			if(this.bAwaitServerClose)
			{
				// uws hangs on .close(), ws doesn't.
				// Without the await, the process will exit just fine on Windows 10, 64 bit.
				// On Travis (Linux) it throws segmentation fault.
				await awaitWebSocketServerClose;
			}

			this._webSocketServerSiteA = null;
			global.gc();
			await sleep(1000);
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
			global.gc();
		}


		this._bPreventHTTPAPIRequests = false;

		await this.urlPublicRequestSignatureAndIV();
		await this.urlPublicRequestGenerate();

		if(this._bBenchmarkMode)
		{
			this.enableConsole();
		}
	}


	/**
	 * @returns {undefined}
	 */
	async runClusterTests()
	{
		const jsonrpcServer = new JSONRPC.Server();
		jsonrpcServer.registerEndpoint(new TestEndpoint()); // See "Define an endpoint" section above.

		// By default, JSONRPC.Server rejects all requests as not authenticated and not authorized.
		jsonrpcServer.addPlugin(new JSONRPC.Plugins.Server.AuthenticationSkip());
		jsonrpcServer.addPlugin(new JSONRPC.Plugins.Server.AuthorizeAll());

		const workerJSONRPCRouter = new JSONRPC.BidirectionalWorkerRouter(jsonrpcServer);

		workerJSONRPCRouter.on("madeReverseCallsClient", (clientReverseCalls) => {
			clientReverseCalls.addPlugin(new JSONRPC.Plugins.Client.DebugLogger());
			clientReverseCalls.addPlugin(new Tests.Plugins.Client.DebugMarker((cluster.isMaster ? "Master" : "Worker") + "; reverse calls;"));
		});

		if(cluster.isMaster)
		{
			// Unless the worker is immediately added to the router, and the add operation awaited,
			// deadlocks may occur because of the awaits on addWorker which may miss the ready call from the worker.
			// Use await Promise.all or add them one by one as below.
			const workerA = cluster.fork();
			const nConnectionIDA = await workerJSONRPCRouter.addWorker(workerA);

			const workerB = cluster.fork();
			const nConnectionIDB = await workerJSONRPCRouter.addWorker(workerB);

			const clientA = workerJSONRPCRouter.connectionIDToSingletonClient(nConnectionIDA, TestClient);
			const clientB = workerJSONRPCRouter.connectionIDToSingletonClient(nConnectionIDB, TestClient);

			const strMessageA = "Master => Worker A " + process.pid;
			assert(strMessageA === await clientA.ping(strMessageA));

			const strMessageB = "Master => Worker B " + process.pid;
			assert(strMessageB === await clientB.ping(strMessageB));

			while(!workerA.isDead() && !workerB.isDead())
			{
				await sleep(10);
			}
		}
		else
		{
			assert(cluster.isWorker);

			const nConnectionID = await workerJSONRPCRouter.addWorker(process, "/api");
			const client = workerJSONRPCRouter.connectionIDToSingletonClient(nConnectionID, TestClient);

			// This is a mandatory call to signal to the master, that the worker is ready to receive JSONRPC requests on a chosen endpoint.
			// This can be hidden in an JSONRPC.Client extending class, inside an overriden .rpc() method.
			// And awaited once.
			await client.rpc("rpc.connectToEndpoint", ["/api"]);

			const strMessage = "Worker " + process.pid + " => Master";
			assert(strMessage === await client.ping(strMessage));

			const arrPromises = [];
			for(let i = 0; i < 100; i++)
			{
				arrPromises.push(client.ping(i + " " + strMessage, /*bRandomSleep*/ true));
			}

			await Promise.all(arrPromises);


			// const clientStandAlone = new TestClient("/api");
			// clientStandAlone.addPlugin(new JSONRPC.Plugins.Client.WorkerTransport(process));

			// This can be hidden in an JSONRPC.Client extending class, inside an overriden .rpc() method.
			// And awaited once.
			//await clientStandAlone.rpc("rpc.connectToEndpoint", [clientStandAlone.endpointURL]);
			//console.log(await clientStandAlone.ping(strMessage + " stand-alone client."));


			client.killWorker(process.pid);
		}
	}


	/**
	 * @returns {undefined}
	 */
	async runEndlessNewWebSockets()
	{
		assert(this._bWebSocketMode);
		assert(this._bBenchmarkMode);

		this.disableConsole();

		if(cluster.isMaster)
		{
			await this.setupHTTPServer();
			await this.setupWebsocketServerSiteA();
			await this.disableServerSecuritySiteA();

			const arrWorkers = [];

			for(let i = 0; i < Math.max(1, -1 /*server core*/ + os.cpus().length); i++)
			{
				const worker = cluster.fork();

				worker.send(i.toString());

				arrWorkers.push(worker);
			}

			let nRoundedConnectionsCount = 0;
			let nNoChangeCount = 0;
			while(true)
			{
				await sleep(2000);

				const nNewRoundedConnectionsCount = Math.round(Object.keys(this._webSocketAuthorizeSiteA._objSessions).length / 10, 0) * 10;

				if(nRoundedConnectionsCount !== nNewRoundedConnectionsCount)
				{
					nNoChangeCount = 0;
					nRoundedConnectionsCount = nNewRoundedConnectionsCount;

					this.console.log(Object.keys(this._webSocketAuthorizeSiteA._objSessions).length + " connections.");
					this.console.log("heapTotal: " + Math.round(process.memoryUsage().heapTotal / 1024 / 1024, 2) + " MB");
				}
				else
				{
					if(++nNoChangeCount === 4)
					{
						process.exit(0);
					}
				}

				for(let i = arrWorkers.length - 1; i >= 0; i--)
				{
					if(arrWorkers[i].isDead())
					{
						arrWorkers.splice(i, 1);

						if(!arrWorkers.length)
						{
							process.exit(1);
						}
					}
				}
			}
		}
		else
		{
			await new Promise((fnResolve, fnReject) => {
				const nTimeoutID = setTimeout(
					() => {
						fnReject(new Error("Timed out waiting for IPC message."));
					},
					60 * 1000
				);

				process.on(
					"message",
					(strMessage) => {
						clearTimeout(nTimeoutID);

						this._strBindIPAddress = "127.0.0." + (parseInt(strMessage, 10) + 2);
						fnResolve();
					}
				);
			});

			assert(cluster.isWorker);

			const arrWebSocketClients = [];
			const arrJSONRPCClients = [];

			while(true)
			{
				let webSocketClient;
				try
				{
					webSocketClient = await this._makeClientWebSocket();
					arrWebSocketClients.push(webSocketClient);
				}
				catch(error)
				{
					console.error(error);
					await sleep(1000);
					continue;
				}

				const jsonrpcServer = new JSONRPC.Server();
				jsonrpcServer.registerEndpoint(new TestEndpoint(this._bBenchmarkMode || !this._bWebSocketMode));

				jsonrpcServer.addPlugin(this._serverAuthenticationSkipPlugin);
				jsonrpcServer.addPlugin(this._serverAuthorizeAllPlugin);

				const wsJSONRPCRouter = new JSONRPC.BidirectionalWebsocketRouter(jsonrpcServer);

				const nWebSocketConnectionID = wsJSONRPCRouter.addWebSocketSync(webSocketClient);
				const jsonrpcClient = wsJSONRPCRouter.connectionIDToSingletonClient(nWebSocketConnectionID, TestClient);

				arrJSONRPCClients.push(jsonrpcClient);
				setInterval(
					() => {
						jsonrpcClient.ping("Hello there! I'm here.");
					},
					1000
				);
			}
		}
	}


	/**
	 * @returns {undefined}
	 */
	async setupHTTPServer()
	{
		console.log("[" + process.pid + "] setupHTTPServer.");

		this._httpServerSiteA = http.createServer();
		this._jsonrpcServerSiteA = new JSONRPC.Server();

		this._jsonrpcServerSiteA.addPlugin(new Tests.Plugins.Server.DebugMarker("SiteA"));

		this._jsonrpcServerSiteA.registerEndpoint(this._testEndpoint);

		this._jsonrpcServerSiteA.attachToHTTPServer(this._httpServerSiteA, "/api/", /*bSharedWithWebSocketServer*/ this._bWebSocketMode);

		this._httpServerSiteA.on(
			"request",
			async (incomingRequest, serverResponse) => {
				// API requests are handled by the VMEndpoint instance above.

				const objParsedURL = url.parse(incomingRequest.url);
				const strFilePath = path.join(path.dirname(path.dirname(__dirname)), objParsedURL.pathname);

				if(
					incomingRequest.method === "GET"
					&& (
						objParsedURL.pathname.substr(0, "/tests/".length) === "/tests/"
						|| objParsedURL.pathname.substr(0, "/builds/".length) === "/builds/"
						|| objParsedURL.pathname.substr(0, "/node_modules/".length) === "/node_modules/"
					)
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

		this._httpServerSiteA.listen(this._nHTTPPort);
	}


	/**
	 * @returns {undefined}
	 */
	async setupWebsocketServerSiteA()
	{
		console.log("[" + process.pid + "] setupWebsocketServerSiteA.");

		if(this._nWebSocketsPort !== this._nHTTPPort)
		{
			this._webSocketServerSiteA = new this._classWebSocketServer({port: this._nWebSocketsPort});
		}
		else
		{
			this._webSocketServerSiteA = new this._classWebSocketServer({server: this._httpServerSiteA});
		}

		this._webSocketServerSiteA.on(
			"error",
			(error) => {
				console.error(error);
				//process.exit(1); // Why did I put this here?
				throw error;
			}
		);


		console.log("[" + process.pid + "] Instantiating Tests.Plugins.Server.WebSocketAuthorize on SiteA.");
		this._webSocketAuthorizeSiteA = new Tests.Plugins.Server.WebSocketAuthorize();

		this._jsonrpcServerSiteA.addPlugin(this._webSocketAuthorizeSiteA);


		console.log("[" + process.pid + "] Instantiating JSONRPC.BidirectionalWebsocketRouter on SiteA.");
		const wsJSONRPCRouter = new JSONRPC.BidirectionalWebsocketRouter(this._jsonrpcServerSiteA);

		wsJSONRPCRouter.on(
			"madeReverseCallsClient",
			(clientReverseCalls) => {
				clientReverseCalls.addPlugin(new JSONRPC.Plugins.Client.DebugLogger());
				clientReverseCalls.addPlugin(new Tests.Plugins.Client.DebugMarker("SiteA; reverse calls;"));
			}
		);


		this._webSocketServerSiteA.on(
			"connection",
			async (webSocket, upgradeRequest) =>
			{
				if(this._classWebSocketAdapter)
				{
					webSocket = new this._classWebSocketAdapter(webSocket);
				}

				const nWebSocketConnectionID = wsJSONRPCRouter.addWebSocketSync(webSocket, upgradeRequest);

				console.log("[" + process.pid + "] Passing a new incoming connection to Tests.Plugins.Server.WebSocketAuthorize.");
				this._webSocketAuthorizeSiteA.addConnection(nWebSocketConnectionID, webSocket);
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
				&& this._webSocketClientSiteB.readyState === JSONRPC.WebSocketAdapters.WebSocketWrapperBase.OPEN
			)
			{
				this._webSocketClientSiteB.close(
					/*CloseEvent.CLOSE_NORMAL*/ 1000,
					"Normal close."
				);

				this._webSocketClientSiteB = null;
			}

			console.log("[" + process.pid + "] Connecting SiteB JSONRPC client to " + this.localEndpointWebSocket + ".");
			let ws = new this._classWebSocket(this.localEndpointWebSocket);

			if(this._classWebSocketAdapter)
			{
				ws = new this._classWebSocketAdapter(ws, this.localEndpointWebSocket);
			}

			await new Promise((fnResolve, fnReject) => {
				ws.on("open", fnResolve);
				ws.on("error", fnReject);
			});

			this._webSocketClientSiteB = ws;

			this._jsonrpcServerSiteB = new JSONRPC.Server();
			this._jsonrpcServerSiteB.registerEndpoint(new TestEndpoint(this._bBenchmarkMode || !this._bWebSocketMode));

			this._jsonrpcServerSiteB.addPlugin(this._serverAuthenticationSkipPlugin);
			this._jsonrpcServerSiteB.addPlugin(this._serverAuthorizeAllPlugin);
			this._jsonrpcServerSiteB.addPlugin(new Tests.Plugins.Server.DebugMarker("SiteB"));

			console.log("[" + process.pid + "] Instantiating JSONRPC.BidirectionalWebsocketRouter on SiteB.");
			const wsJSONRPCRouter = new JSONRPC.BidirectionalWebsocketRouter(
				this._jsonrpcServerSiteB
			);

			const nWebSocketConnectionID = wsJSONRPCRouter.addWebSocketSync(this._webSocketClientSiteB);

			// Alternatively, the madeReverseCallsClient event can be used.
			// In this case however, only a single client is suposed to exist.
			this._jsonrpcClientSiteB = wsJSONRPCRouter.connectionIDToSingletonClient(nWebSocketConnectionID, TestClient);
			this._jsonrpcClientSiteB.addPlugin(new Tests.Plugins.Client.DebugMarker("SiteB"));
			this._jsonrpcClientSiteB.addPlugin(new JSONRPC.Plugins.Client.DebugLogger());
		}
		else
		{
			this._jsonrpcClientSiteB = new TestClient("http://" + this._strBindIPAddress + ":" + this._nHTTPPort + "/api");
			this._jsonrpcClientSiteB.addPlugin(new Tests.Plugins.Client.DebugMarker("SiteB"));
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
				&& this._webSocketClientSiteC.readyState === JSONRPC.WebSocketAdapters.WebSocketWrapperBase.OPEN
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
			this._jsonrpcServerSiteC.registerEndpoint(new TestEndpoint(this._bBenchmarkMode || !this._bWebSocketMode));

			this._jsonrpcServerSiteC.addPlugin(this._serverAuthenticationSkipPlugin);
			this._jsonrpcServerSiteC.addPlugin(this._serverAuthorizeAllPlugin);
			this._jsonrpcServerSiteC.addPlugin(new Tests.Plugins.Server.DebugMarker("SiteC"));

			console.log("[" + process.pid + "] Instantiating JSONRPC.BidirectionalWebsocketRouter on SiteC.");
			const wsJSONRPCRouter = new JSONRPC.BidirectionalWebsocketRouter(
				this._jsonrpcServerSiteC
			);

			const nWebSocketConnectionID = wsJSONRPCRouter.addWebSocketSync(this._webSocketClientSiteC);

			// Alternatively, the madeReverseCallsClient event can be used.
			// In this case however, only a single client is suposed to exist.
			this._jsonrpcClientSiteC = wsJSONRPCRouter.connectionIDToSingletonClient(nWebSocketConnectionID, TestClient);
			this._jsonrpcClientSiteC.addPlugin(new Tests.Plugins.Client.DebugMarker("SiteC"));
			this._jsonrpcClientSiteC.addPlugin(new JSONRPC.Plugins.Client.DebugLogger());
		}
		else
		{
			this._jsonrpcClientSiteC = new TestClient("http://" + this._strBindIPAddress + ":" + this._nHTTPPort + "/api");
			this._jsonrpcClientSiteC.addPlugin(new Tests.Plugins.Client.DebugMarker("SiteC"));
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
				&& this._webSocketClientSiteDisconnecter.readyState === JSONRPC.WebSocketAdapters.WebSocketWrapperBase.OPEN
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
			this._jsonrpcServerSiteDisconnecter.registerEndpoint(new TestEndpoint(this._bBenchmarkMode || !this._bWebSocketMode));

			this._jsonrpcServerSiteDisconnecter.addPlugin(this._serverAuthenticationSkipPlugin);
			this._jsonrpcServerSiteDisconnecter.addPlugin(this._serverAuthorizeAllPlugin);
			this._jsonrpcServerSiteDisconnecter.addPlugin(new Tests.Plugins.Server.DebugMarker("SiteDisconnecter"));

			console.log("[" + process.pid + "] Instantiating JSONRPC.BidirectionalWebsocketRouter on SiteDisconnecter.");
			const wsJSONRPCRouter = new JSONRPC.BidirectionalWebsocketRouter(
				this._jsonrpcServerSiteDisconnecter
			);

			const nWebSocketConnectionID = wsJSONRPCRouter.addWebSocketSync(this._webSocketClientSiteDisconnecter);

			// Alternatively, the madeReverseCallsClient event can be used.
			// In this case however, only a single client is suposed to exist.
			this._jsonrpcClientSiteDisconnecter = wsJSONRPCRouter.connectionIDToSingletonClient(nWebSocketConnectionID, TestClient);
			this._jsonrpcClientSiteDisconnecter.addPlugin(new Tests.Plugins.Client.DebugMarker("SiteDisconnecter"));
			this._jsonrpcClientSiteDisconnecter.addPlugin(new JSONRPC.Plugins.Client.DebugLogger());
		}
		else
		{
			this._jsonrpcClientSiteDisconnecter = new TestClient("http://" + this._strBindIPAddress + ":" + this._nHTTPPort + "/api");
			this._jsonrpcClientSiteDisconnecter.addPlugin(new Tests.Plugins.Client.DebugMarker("SiteDisconnecter"));
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
				console.error(error.constructor.name);
				throw error;
			}

			if(process.execPath)
			{
				console.error(error);
				// nodejs specific error.
				assert(
					error.message.includes("ECONNREFUSED") // ws
					|| error.message.includes("uWs client connection error") // uws
				);
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

		const client = new TestClient("http://" + this._strBindIPAddress + ":" + this._nHTTPPort + "/api/bad-endpoint-path");
		client.addPlugin(new Tests.Plugins.Client.DebugMarker("SiteB"));
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

			console.error(error);

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

		const client = new TestClient("http://" + this._strBindIPAddress + ":" + this._nHTTPPort + "/unhandled-path");
		client.addPlugin(new Tests.Plugins.Client.DebugMarker("SiteB"));
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

			console.log(error);
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

		const invalidJSONPlugin = new Tests.Plugins.Client.InvalidRequestJSON();
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

		const invalidJSONPlugin = new Tests.Plugins.Server.InvalidResponseJSON();
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
	 * @param {boolean} bNotification = false
	 * @param {boolean} bVeryLargePayload = false
	 *
	 * @returns {undefined}
	 */
	async callRPCMethodSiteB(bDoNotSleep, bNotification = false, bVeryLargePayload = false)
	{
		const bRandomSleep = !bDoNotSleep;
		bVeryLargePayload = bVeryLargePayload && !this._bDisableVeryLargePacket;

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

		const mxResponse = await this._jsonrpcClientSiteB.rpc("ping", arrParams, bNotification);

		if(bNotification)
		{
			assert(mxResponse === null || mxResponse === undefined, "Notifications cannot return " + JSON.stringify(mxResponse));
		}
		else
		{
			assert.strictEqual(strParam, mxResponse);
		}
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

			this._jsonrpcClientNonBidirectional = new TestClient(this.localEndpointWebSocket);
			this._jsonrpcClientNonBidirectional.addPlugin(new Tests.Plugins.Client.DebugMarker("NonBidirectionalClient"));
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

			console.error(error);
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
		// There are some issues on Linux with this.
		if(os.platform() !== "win32")
		{
			return;
		}

		assert(fs.existsSync(path.resolve(path.dirname(path.dirname(__dirname)) + "/builds/browser/es5/jsonrpc.min.js")));
		assert(fs.existsSync(path.resolve(path.dirname(__dirname) + "/Browser/index.html")));

		const phantom = await Phantom.create(
			[],
			{
				logger: console,
				logLevel: "error" // error | debug
			}
		);

		let phantomPage;
		try
		{
			phantomPage = await phantom.createPage();
		}
		catch(error)
		{
			if(
				error.message.includes("Error reading from stdin")
				&& os.platform() === "linux"
			)
			{
				// https://github.com/amir20/phantomjs-node/issues/649
				console.error("phantomjs may have reported an error in the phantom library.");
				console.error("If missing phantomjs dependencies: yum install libXext  libXrender  fontconfig  libfontconfig.so.1");

				const processCommand = exec("../node_modules/phantomjs-prebuilt/lib/phantom/bin/phantomjs --help");
				processCommand.stdout.pipe(process.stdout);
				processCommand.stderr.pipe(process.stderr);
				await new Promise(async (fnResolve, fnReject) => {
					processCommand.on("error", fnReject);
					processCommand.on("exit", (nCode) => {
						if(nCode === 0)
						{
							fnResolve();
						}
						else
						{
							fnReject(new Error("Failed with error code " + nCode));
						}
					});
				});

				process.exit(1);
			}

			throw error;
		}

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

		const strPhatomPageURL = `http://${this._strBindIPAddress}:${this._nHTTPPort}/tests/Browser/index.html?websocketmode=${this._bWebSocketMode ? 1 : 0}&websocketsport=${this._nWebSocketsPort}`.replace(/\\+/g, "/").replace(/^\//, "");
		console.log("Trying to open " + strPhatomPageURL);
		const strStatus = await phantomPage.open(strPhatomPageURL);
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
		// On OSX there some OS rate limit with ECONNRESET errors.
		let nCallCount;
		if(os.platform() === "darwin")
		{
			nCallCount = this._bWebSocketMode ? (this._bBenchmarkMode ? 20 : 20) : 20;
		}
		else
		{
			nCallCount = this._bWebSocketMode ? (this._bBenchmarkMode ? 20000 : 2000) : 500;
		}

		const fnPickAMethodIndex = (i) => {
			if(this._bBenchmarkMode)
			{
				return i % arrMethods.length;
			}
			else
			{
				return Math.round(Math.random() * (arrMethods.length - 1));
			}
		};

		for(let i = 0; i < nCallCount; i++)
		{
			arrPromises.push(arrMethods[fnPickAMethodIndex(i)].apply(this, []));
		}

		await Promise.all(arrPromises);

		if(this._bBenchmarkMode)
		{
			this.enableConsole();
		}

		console.log(nCallCount + " calls executed in " + ((new Date()).getTime() - nStartTime) + " milliseconds.");

		if(this._bBenchmarkMode)
		{
			console.log("heapTotal: " + Math.round(process.memoryUsage().heapTotal / 1024 / 1024, 2) + " MB");
			this.disableConsole();
		}
	}


	/**
	 * @returns {WebSocket}
	 */
	async _makeClientWebSocket()
	{
		console.log("[" + process.pid + "] Connecting WebSocket to " + this.localEndpointWebSocket + ".");
		let webSocket = new this._classWebSocket(this.localEndpointWebSocket, undefined, {localAddress: this._strBindIPAddress});

		if(this._classWebSocketAdapter)
		{
			webSocket = new this._classWebSocketAdapter(webSocket, this.localEndpointWebSocket);
		}

		await new Promise((fnResolve, fnReject) => {
			webSocket.on("open", fnResolve);
			webSocket.on("error", fnReject);
		});

		return webSocket;
	}


	/**
	 * @returns {string}
	 */
	get localEndpointWebSocket()
	{
		assert(this._nWebSocketsPort, JSON.stringify(this._nWebSocketsPort));
		return "ws://" + this._strBindIPAddress + ":" + this._nWebSocketsPort + "/api";
	}


	disableConsole()
	{
		if(!this.savedConsole)
		{
			this.savedConsole = {log: console.log, error: console.error};
		}

		console.log = () => {};
		console.error = () => {};
	}


	enableConsole()
	{
		if(this.savedConsole)
		{
			console.log = this.savedConsole.log;
			console.error = this.savedConsole.error;

			this.savedConsole = null;
		}
	}


	get console()
	{
		return this.savedConsole ? this.savedConsole : console;
	}
};
