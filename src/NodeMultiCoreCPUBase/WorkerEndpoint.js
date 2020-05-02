const assert = require("assert");

const JSONRPC = {
	EndpointBase: require("../EndpointBase"),
	Server: require("../Server"),
	Client: require("../Client"),
	Plugins: {
		Server: require("../Plugins/Server"),
		Client: require("../Plugins/Client")
	}
};


/**
 * Extend this class to export extra worker RPC APIs.
 * 
 * Counter-intuitively, this endpoint instantiates its own JSONRPC.Server and JSONRPC.RouterBase,
 * inside .start().
 */
class WorkerEndpoint extends JSONRPC.EndpointBase
{
	constructor(classReverseCallsClient)
	{
		super(
			/*strName*/ "WorkersIPC", 
			/*strPath*/ "/api-workers/IPC", 
			/*objReflection*/ {}, 
			classReverseCallsClient
		);

		this._bidirectionalWorkerRouter = null;
		this._jsonrpcServer = null;
		this._masterClient = null;
		
		this.nServicesShutdownTimeoutID = null;
		this.bShuttingDown = false;

		this._bWorkerStarted = false;

		this._nPersistentWorkerID = undefined;
	}


	/**
	 * @returns {number}
	 */
	async _currentWorkerID()
	{
		throw new Error("Must implement _currentWorkerID().");
	}


	/**
	 * @returns {process|worker_threads}
	 */
	async _currentWorker()
	{
		throw new Error("Must implement _currentWorker().");
	}


	/**
	 * @returns {JSONRPC.RouterBase}
	 */
	async _makeBidirectionalRouter()
	{
		throw new Error("Must implement _makeBidirectionalRouter().");
	}


	/**
	 * @returns {JSONRPC.Client}
	 */
	get masterClient()
	{
		if(!this._masterClient)
		{
			throw new Error("The master client is ready only after calling await .startWorker().");
		}

		return this._masterClient;
	}

	async getIfNotPresentPersistentWorkerID()
	{
		if(this._nPersistentWorkerID === undefined)
		{
			this._nPersistentWorkerID = await this._masterClient.getPersistentIDForWorkerID();
		}

		return this._nPersistentWorkerID;
	}


	/**
	 * This overridable function is called and awaited inside startWorker().
	 * 
	 * This mustn't be called through JSONRPC.
	 * 
	 * @param {undefined} incomingRequest
	 */
	async _startServices(incomingRequest)
	{
		if(incomingRequest)
		{
			throw new Error("This mustn't be called through JSONRPC.");
		}
	}


	/**
	 * This overridable function is called and awaited inside gracefulExit().
	 * Careful, gracefulExit() will timeout after waiting for services to stop after a while.
	 * 
	 * This mustn't be called through JSONRPC.
	 * 
	 * @param {undefined} incomingRequest
	 */
	async _stopServices(incomingRequest)
	{
		if(incomingRequest)
		{
			throw new Error("This mustn't be called through JSONRPC.");
		}
	}


	/**
	 * This mustn't be called through JSONRPC.
	 * 
	 * Starts the JSONRPC server over cluster or worker_threads IPC (connected to master), and worker services (this._startServices), 
	 * then it notifies the master process it is ready to receive calls.
	 */
	async start()
	{
		if(this._bWorkerStarted)
		{
			throw new Error("Worker is already started.");
		}
		this._bWorkerStarted = true;
		

		this._jsonrpcServer = new JSONRPC.Server();
		this._bidirectionalWorkerRouter = await this._makeBidirectionalRouter();

		// By default, JSONRPC.Server rejects all requests as not authenticated and not authorized.
		this._jsonrpcServer.addPlugin(new JSONRPC.Plugins.Server.AuthenticationSkip());
		this._jsonrpcServer.addPlugin(new JSONRPC.Plugins.Server.AuthorizeAll());

		const nConnectionID = await this._bidirectionalWorkerRouter.addWorker(await this._currentWorker(), "/api-workers/IPC");
		this._masterClient = this._bidirectionalWorkerRouter.connectionIDToSingletonClient(nConnectionID, this.ReverseCallsClientClass);

		this._jsonrpcServer.registerEndpoint(this);

		// BidirectionalWorkerRouter requires to know when JSONRPC has finished its setup to avoid very likely race conditions.
		await this._masterClient.rpc("rpc.connectToEndpoint", ["/api-workers/IPC"]);

		await this._startServices();
		await this._masterClient.workerServicesReady(await this._currentWorkerID());
	}


	/**
	 * @param {JSONRPC.IncomingRequest} incomingRequest
	 * 
	 * @returns {never}
	 */
	async gracefulExit(incomingRequest)
	{
		this.bShuttingDown = true;

		const nGracefulExitTimeoutMilliseconds = 30 * 1000;

		this.nServicesShutdownTimeoutID = setTimeout(
			() => {
				console.error(new Error(`
					Timed out waiting for services to shutdown. 
					Services status: 
						
				`.replace(/^\t+/gm, "").trim()));
				process.exit(1);
			},
			nGracefulExitTimeoutMilliseconds
		);


		await this._stopServices();
		clearTimeout(this.nServicesShutdownTimeoutID);


		console.log("[" + process.pid + "] Worker exiting gracefuly.");
		process.exit(0);
	}


	/**
	 * @protected
	 * 
	 * This works as an internal router to a JSONRPC.Server's endpoints, used as libraries.
	 * 
	 * Proxies RPC requests into the a JSONRPC.Server's registered endpoints (potentially internet facing exported functions).
	 * 
	 * **************** SKIPS ANY AUTHENTICATION OR AUTHORIZATION LAYERS***********************
	 * ****************     as well as any other JSONRPC plugins    ***************************
	 * 
	 * strEndpointPath is an endpoint path such as "/api-something/ipc/some-app".
	 * 
	 * @param {JSONRPC.IncomingRequest} incomingRequest
	 * @param {JSONRPC.Server} jsonrpcServer
	 * @param {string} strEndpointPath
	 * @param {string} strFunctionName
	 * @param {Array} arrParams
	 * @param {boolean} bNotification = false
	 * 
	 * @returns {*}
	 */
	async _rpcToInternalEndpointAsLibrary(incomingRequest, jsonrpcServer, strEndpointPath, strFunctionName, arrParams, bNotification = false)
	{
		assert(Array.isArray(arrParams), "arrParams must be of type Array.");

		strEndpointPath = JSONRPC.EndpointBase.normalizePath(strEndpointPath);
		if(!jsonrpcServer.endpoints[strEndpointPath])
		{
			console.error("Existing registered endpoint paths: " + Object.keys(jsonrpcServer.endpoints));
			throw new JSONRPC.Exception(`Endpoint path ${JSON.stringify(strEndpointPath)} not found.`);
		}

		const endpoint = jsonrpcServer.endpoints[strEndpointPath];

		if(!endpoint[strFunctionName])
		{
			throw new JSONRPC.Exception(`Endpoint path ${JSON.stringify(strEndpointPath)} does not have a method called ${JSON.stringify(strFunctionName)}.`, JSONRPC.Exception.METHOD_NOT_FOUND);
		}

		if(bNotification)
		{
			endpoint[strFunctionName].apply(endpoint, [incomingRequest].concat(arrParams)).catch(console.error);
			return null;
		}

		return await endpoint[strFunctionName].apply(endpoint, [incomingRequest].concat(arrParams));
	}


	/**
	 * @abstract
	 * 
	 * This works as an internal router to a JSONRPC.Server's endpoints, used as libraries.
	 * 
	 * Proxies RPC requests directly into potentially an internet facing JSONRPC.Server's registered endpoints.
	 * 
	 * strEndpointPath is an endpoint path such as "/api-something/ipc/some-app".
	 * 
	 * **************** SKIPS ANY AUTHENTICATION OR AUTHORIZATION LAYERS***********************
	 * ****************     as well as any other JSONRPC plugins    ***************************
	 * 
	 * @param {JSONRPC.IncomingRequest} incomingRequest
	 * @param {string} strEndpointPath
	 * @param {string} strFunctionName
	 * @param {Array} arrParams
	 * @param {boolean} bNotification = false
	 */
	async rpcToInternalEndpointAsLibrary(incomingRequest, strEndpointPath, strFunctionName, arrParams, bNotification = false)
	{
		//return this._rpcToInternalEndpointAsLibrary(
		//	incomingRequest, 
		//	/*jsonrpcServer*/ PROVIDE_JSONRPC_SERVER_CLASS_INSTANCE_HERE, 
		//	strEndpointPath, 
		//	strFunctionName, 
		//	arrParams, 
		//	bNotification
		//);

		throw new Error("Not implemented.");
	}
};

module.exports = WorkerEndpoint;
