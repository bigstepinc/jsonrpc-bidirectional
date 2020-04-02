const assert = require("assert");

const JSONRPC = {
	Server: require("./Server")
};

const EventEmitter = require("events");


/**
 * @event disposed {bCallJSONRPCServerDispose, bCallEndpointDispose, bCallPluginDispose}
 */
class RouterBase extends EventEmitter
{
	/**
	 * Clients are automatically instantiated per connection and are available as a property of the first param of the exported functions,
	 * if the JSONRPC.EndpointBase constructor param classReverseCallsClient was set to a JSONRPC.Client subclass.
	 * 
	 * If jsonrpcServer is non-null and classReverseCallsClient is set on at least one endpoint, then bi-directional JSONRPC over the same websocket is enabled.
	 * 
	 * @param {JSONRPC.Server|null} jsonrpcServer
	 */
	constructor(jsonrpcServer)
	{
		super();

		assert(jsonrpcServer === null || jsonrpcServer instanceof JSONRPC.Server, "jsonrpcServer must be either null or an instance or subclass of JSONRPC.Server.");

		this._jsonrpcServer = jsonrpcServer;

		this._nConnectionIDCounter = 0;

		this._objSessions = {};
	}


	/**
	 * @returns {null}
	 */
	dispose({bCallJSONRPCServerDispose = true, bCallEndpointDispose = true, bCallPluginDispose = true} = {})
	{
		if(bCallJSONRPCServerDispose && this._jsonrpcServer)
		{
			this._jsonrpcServer.dispose({bCallEndpointDispose, bCallPluginDispose});
		}

		this.emit("disposed", {bCallJSONRPCServerDispose, bCallEndpointDispose, bCallPluginDispose});
	}


	/**
	 * If the client does not exist, it will be generated and saved on the session.
	 * Another client will not be generated automatically, regardless of the accessed endpoint's defined client class for reverse calls.
	 * 
	 * If client is provided it will be saved and used, while ClientClass will be ignored.
	 * 
	 * @param {number} nConnectionID
	 * @param {Class|null} ClientClass = null
	 * @param {JSONRPC.Client|null} client = null
	 * 
	 * @returns {JSONRPC.Client}
	 */
	connectionIDToSingletonClient(nConnectionID, ClientClass = null, client = null)
	{
		assert(typeof nConnectionID === "number", "nConnectionID must be a number. Received this: " + JSON.stringify(nConnectionID));
		assert(ClientClass === null || typeof ClientClass === "function", "Invalid ClientClass value: " + (typeof ClientClass));

		if(!client && !ClientClass)
		{
			throw new Error("At least one of client or ClientClass must be non-null.");
		}

		if(!this._objSessions.hasOwnProperty(nConnectionID))
		{
			throw new Error("Connection " + JSON.stringify(nConnectionID) + " not found in router.");
		}

		if(this._objSessions[nConnectionID].clientReverseCalls === null)
		{
			this._objSessions[nConnectionID].clientReverseCalls = client || this._makeReverseCallsClient(
				ClientClass,
				this._objSessions[nConnectionID]
			);
		}
		else
		{
			assert(
				ClientClass === null || this._objSessions[nConnectionID].clientReverseCalls instanceof ClientClass, 
				"clientReverseCalls already initialized with a different JSONRPC.Client subclass."
			);
		}

		return this._objSessions[nConnectionID].clientReverseCalls;
	}


	/**
	 * @param {number} nConnectionID 
	 */
	onConnectionEnded(nConnectionID)
	{
		delete this._objSessions[nConnectionID];
	}


	/**
	 * @param {Class} ClientClass
	 * @param {object} objSession
	 * 
	 * @returns {JSONRPC.Client}
	 */
	_makeReverseCallsClient(ClientClass, objSession)
	{
		throw new Error("Must implement.");
	}
};


module.exports = RouterBase;
