const cluster = require("cluster");

const JSONRPC = {
	EndpointBase: require("../EndpointBase"),
	Server: require("../Server"),
	Client: require("../Client"),
	BidirectionalWorkerRouter: require("../BidirectionalWorkerRouter"),
	Plugins: {
		Server: require("../Plugins/Server"),
		Client: require("../Plugins/Client")
	}
};


/**
 * Extend this class to export extra worker RPC APIs.
 * 
 * Counter-intuitively, this endpoint instantiates its own JSONRPC.Server and JSONRPC.BidirectionalWorkerRouter,
 * inside .start().
 */
class WorkerEndpoint extends JSONRPC.EndpointBase
{
	constructor(classReverseCallsClient)
	{
		console.log(`Fired up ${cluster.isWorker ? "worker" : "master"} with PID ${process.pid}`);
		
		super(
			/*strName*/ "ClusterIPC", 
			/*strPath*/ "/api-cluster/IPC", 
			/*objReflection*/ {}, 
			classReverseCallsClient
		);

		if(cluster.isMaster)
		{
			throw new Error("WorkerEndpoint can only be instantiated in a worker process.");
		}

		this._bidirectionalWorkerRouter = null;
		this._jsonrpcServer = null;
		this._masterClient = null;
		
		this.nServicesShutdownTimeoutID = null;
		this.bShuttingDown = false;

		this._bWorkerStarted = false;
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

		// this.masterClient is available here.
	}


	/**
	 * This overridable function is called and awaited inside gracefulExit().
	 * Careful, gracefulExit() will timeout waiting after services to stop after a while.
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
	 * Starts the JSONRPC server over cluster IPC (connected to master), and worker services (this._startServices), 
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
		this._bidirectionalWorkerRouter = new JSONRPC.BidirectionalWorkerRouter(this._jsonrpcServer);

		// By default, JSONRPC.Server rejects all requests as not authenticated and not authorized.
		this._jsonrpcServer.addPlugin(new JSONRPC.Plugins.Server.AuthenticationSkip());
		this._jsonrpcServer.addPlugin(new JSONRPC.Plugins.Server.AuthorizeAll());

		const nConnectionID = await this._bidirectionalWorkerRouter.addWorker(process, "/api-cluster/IPC");
		this._masterClient = this._bidirectionalWorkerRouter.connectionIDToSingletonClient(nConnectionID, this.ReverseCallsClientClass);

		this._jsonrpcServer.registerEndpoint(this);


		await this._startServices();
		await this._masterClient.workerServicesReady(cluster.worker.id);


		// BidirectionalWorkerRouter requires to know when JSONRPC has finished its setup to avoid very likely race conditions.
		await this._masterClient.rpc("rpc.connectToEndpoint", ["/api-cluster/IPC"]);
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
};

module.exports = WorkerEndpoint;
