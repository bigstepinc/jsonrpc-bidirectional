const WebSocketWrapperBase = require("../WebSocketWrapperBase");

module.exports = 
class WebSocketWrapper extends WebSocketWrapperBase
{
	/**
	 * @param {WebSocket} webSocket 
	 * @param {string|undefined} strURL 
	 */
	constructor(webSocket, strURL)
	{
		super(webSocket);

		if(typeof strURL === "string")
		{
			this._strURL = strURL;
		}
		else
		{
			this._strURL = webSocket.url ? webSocket.url : webSocket.upgradeReq.url;
		}

		this.objListeningFor = {};
		
		if(webSocket.upgradeReq)
		{
			// Manual at https://github.com/uWebSockets/bindings/tree/master/nodejs says:
			// webSocket.upgradeReq is only valid during execution of the connection handler. 
			// If you want to keep properties of the upgradeReq for the entire lifetime of the webSocket you better attach that specific property to the webSocket at connection.
			this._objUpgradeReq = webSocket.upgradeReq; /*{
				url: webSocket.upgradeReq.url,
				headers: webSocket.upgradeReq.headers, //JSON.parse(JSON.stringify(webSocket.upgradeReq.headers)),
				socket: {
					remoteAddress: webSocket.upgradeReq.socket ? webSocket.upgradeReq.socket.remoteAddress : undefined
				}
			}*/;
		}
		else
		{
			this._objUpgradeReq = undefined;
		}
	}


	/**
	 * @override
	 * 
	 * @returns {string}
	 */
	get url()
	{
		return this._strURL;
	}


	/**
	 * @returns {Object|undefined}
	 */
	get upgradeReq()
	{
		return this._objUpgradeReq;
	}


	/**
	 * Events splitter.
	 * 
	 * @override
	 * 
	 * @param {string} strEventName 
	 * @param {Function} fnListener 
	 */
	on(strEventName, fnListener)
	{
		super.superOn(strEventName, fnListener);

		// uws does not allow multiple event listeners.
		// Getting around that...
		if(!this.objListeningFor[strEventName])
		{
			this.objListeningFor[strEventName] = true;

			return this._webSocket.on(
				strEventName,
				(...theArgs) => {
					this.emit(strEventName, ...theArgs);
				}
			);
		}
	}
};
