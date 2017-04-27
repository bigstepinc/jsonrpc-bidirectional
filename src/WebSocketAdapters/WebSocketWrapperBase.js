const EventEmitter = require("events");

module.exports = 
class WebSocketWrapperBase extends EventEmitter
{
	constructor(webSocket, strURL)
	{
		super();

		this._webSocket = webSocket;
	}


	/**
	 * @returns {string|undefined}
	 */
	get url()
	{
		return this._webSocket.url;
	}


	/**
	 * @returns {Socket}
	 */
	get socket()
	{
		return this._webSocket.socket;
	}


	/**
	 * @returns {number}
	 */
	get readyState()
	{
		return this._webSocket.readyState;
	}


	/**
	 * @returns {string}
	 */
	get protocol()
	{
		return this._webSocket.protocol;
	}


	/**
	 * @returns {number}
	 */
	get protocolVersion()
	{
		return this._webSocket.protocolVersion;
	}


	/**
	 * @returns {number}
	 */
	static get CONNECTING()
	{
		return 0;
	}


	/**
	 * @returns {number}
	 */
	static get OPEN()
	{
		return 1;
	}


	/**
	 * @returns {number}
	 */
	static get CLOSING()
	{
		return 2;
	}


	/**
	 * @returns {number}
	 */
	static get CLOSED()
	{
		return 3;
	}


	/**
	 * @param {string} strEventName 
	 * @param {Function} fnListener 
	 */
	on(strEventName, fnListener)
	{
		return this._webSocket.on(strEventName, fnListener);
	}


	/**
	 * @param {string} strEventName 
	 * @param {Function} fnListener 
	 */
	superOn(strEventName, fnListener)
	{
		return super.on(strEventName, fnListener);
	}


	send(mxData, ...args)
	{
		return this._webSocket.send(mxData, ...args);
	}


	/**
	 * @param {number} nCode 
	 * @param {string} strReason 
	 */
	close(nCode, strReason)
	{
		return this._webSocket.close(nCode, strReason);
	}


	/**
	 * 
	 */
	terminate()
	{
		return this._webSocket.terminate();
	}


	ping(...args)
	{
		return this._webSocket.ping(...args);
	}


	pong(...args)
	{
		return this._webSocket.pong(...args);
	}
};
