const assert = require("assert");

const JSONRPC = require("../index");
JSONRPC.Server = require("./Server");

const EventEmitter = require("events");

module.exports =
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

		assert(jsonrpcServer === null || jsonrpcServer instanceof JSONRPC.Server);

		this._jsonrpcServer = jsonrpcServer;

		this._nConnectionIDCounter = 0;

		this._objSessions = {};
	}


	/**
	 * If the client does not exist, it will be generated and saved on the session.
	 * Another client will not be generated automatically, regardless of the accessed endpoint's defined client class for reverse calls.
	 * 
	 * @param {number} nConnectionID
	 * @param {Class} ClientClass
	 * 
	 * @returns {JSONRPC.Client}
	 */
	connectionIDToSingletonClient(nConnectionID, ClientClass)
	{
		assert(typeof nConnectionID === "number", "nConnectionID must be a number. Received this: " + JSON.stringify(nConnectionID));
		assert(typeof ClientClass === "function", "Invalid ClientClass value: " + (typeof ClientClass));

		if(!this._objSessions.hasOwnProperty(nConnectionID))
		{
			throw new Error("Connection " + JSON.stringify(nConnectionID) + " not found in router.");
		}

		if(this._objSessions[nConnectionID].clientReverseCalls === null)
		{
			this._objSessions[nConnectionID].clientReverseCalls = this._makeReverseCallsClient(
				ClientClass,
				this._objSessions[nConnectionID]
			);
		}
		else
		{
			assert(
				this._objSessions[nConnectionID].clientReverseCalls instanceof ClientClass, 
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
	 * @param {Object} objSession
	 * 
	 * @returns {JSONRPC.Client}
	 */
	_makeReverseCallsClient(ClientClass, objSession)
	{
		throw new Error("Must implement.");
	}
};
