const WebSocket = require("uws");
const WebSocketServer = WebSocket.Server;


(async () => {
	const webSocketServer = new WebSocketServer({port: 8080});
	webSocketServer.on("error", console.error);
	webSocketServer.on("connection", console.log);
	webSocketServer.on("message", console.log);


	
	const webSocket = new WebSocket("ws://localhost:8080/api");
	await new Promise((fnResolve, fnReject) => {
		webSocket.on("open", fnResolve);
		webSocket.on("error", fnReject);
	});

	let str10MBPayload = "";
	let nIterator = 0;
	while(str10MBPayload.length < 10 * 1024 * 1024 /*10 MB*/)
	{
		str10MBPayload += str10MBPayload + "_" + (++nIterator);
	}
	
	webSocket.on("close", process.exit);
	webSocket.send(str10MBPayload);
})();
