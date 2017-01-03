# Bi-directional JSON-RPC 2.0 server and client

A main goal of this project is to have the JSONRPC server and client support __bi-directional requests over a single WebSocket connection.__

Both the server and client support two transports, HTTP and WebSocket ([websockets/ws](https://github.com/websockets/ws) compatible API), and allow more through plugin extensibility. 

Plugins are allowed to replace the JSON-RPC protocol altogether, extend the protocol or wrap it.

__Plugins for the server or the client may also be custom middle layers__, for example: authentication, authorization, validation, routing, backward compatibility translation, advanced error logging, automatic retries, caching, etc.

See `JSONRPC.ClientPluginBase` and `JSONRPC.ServerPluginBase`. Plugins may be added on `JSONRPC.Server` and `JSONRPC.Client` instances using the `.addPlugin()` method.

Events may be used instead of plugins. Method names in `JSONRPC.ClientPluginBase` and `JSONRPC.ServerPluginBase` are also event names (event handlers have the same params) while `JSONRPC.Server` and `JSONRPC.Client` emit these events.

Events may be more efficient than plugins, if very small performance gains matter. Plugins on the other hand help write readable and maintanable code.


## Define an endpoint
`JSONRPC.Server` exports methods of registered `JSONRPC.EndpointBase` subclass instances.

The JSONRPC.Server supports multiple endpoints at the same time.

On an incoming request, endpoints are identified by the URL path of the HTTP request, or of the WebSocket connection. 

For example, both these URLs point to the same endpoint: `ws://localhost/api`, `http://localhost/api`, as both have `/api` as path.

```JavaScript

const JSONRPC = require("jsonrpc-bidirectional");

module.exports =
class TestEndpoint extends JSONRPC.EndpointBase 
{
	constructor()
	{
		super(
			/*strName*/ "Test", 
			/*strPath*/ "/api", 
			/*objReflection*/ {}, // Reserved for future use.
			/*classReverseCallsClient*/ JSONRPC.Client // This may be left undefined
		);

		// incomingRequest.reverseCallsClient must be specified to enable bi-directional JSON-RPC over a single WebSocket connection.
		// If may be left undefined for one-way interrogation.
		// It must contain a subclass of JSONRPC.Client or an instance of JSONRPC.Client itself.
	}

	async ping(incomingRequest, strReturn, bThrow)
	{
		if(bThrow)
		{
			throw new JSONRPC.Exception("You asked me to throw.");
		}

		// If using bi-directional JSON-RPC over a single WebSocket connection, a JSONRPC.Client subclass instance is available.
		// It is an instance of the class specified in the constructor of this EndpointBase subclass, `classReverseCallsClient`.
		// Also, it is attached to the same WebSocket connection of the current request.
		await incomingRequest.reverseCallsClient.rpc("methodOnTheOtherSide", ["paramValue", true, false]);

		return strReturn;
	}

	async divide(incomingRequest, nLeft, nRight)
	{
		return nLeft / nRight;
	}
};
```


## Extending the client

Extending the `JSONRPC.Client` base class makes the code more readable. 

This client's function names and params correspond to what `TestEndpoint` exports, defined above.

```JavaScript
const JSONRPC = require("jsonrpc-bidirectional");

module.exports =
class TestClient extends JSONRPC.Client
{
	/**
	 * @param {JSONRPC.IncomingRequest} incomingRequest
	 * @param {string} strReturn
	 * @param {boolean} bThrow
	 * 
	 * @returns {string}
	 */
	async ping(strReturn, bThrow)
	{
		return this.rpc("ping", [...arguments]);
	}


	/**
	 * @param {number} nLeft
	 * @param {number} nRight
	 *
	 * @returns {number}
	 */
	async divide(nLeft, nRight)
	{
		return this.rpc("divide", [...arguments]);
	}
```


## Simple JSONRPC.Server over HTTP
```JavaScript
const JSONRPC = require("jsonrpc-bidirectional");

const httpServer = http.createServer();
const jsonrpcServer = new JSONRPC.Server();

jsonrpcServer.registerEndpoint(new TestEndpoint());

jsonrpcServer.attachToHTTPServer(httpServer, "/api/");

// By default, JSONRPC.Server rejects all requests as not authenticated and not authorized.
jsonrpcServer.addPlugin(new JSONRPC.Plugins.Server.AuthenticationSkip());
jsonrpcServer.addPlugin(new JSONRPC.Plugins.Server.AuthorizeAll());

httpServer.listen(80);
```


## Simple JSONRPC.Client over HTTP
```JavaScript
const JSONRPC = require("jsonrpc-bidirectional");


const testClient = new TestClient("http://localhost/api");

const nDivisionResult = await testClient.divide(2, 1);
```


## Simple JSONRPC.Client over WebSocket
Non-bidirectional JSONRPC.Client over a WebSocket client connection.

```JavaScript
const JSONRPC = require("jsonrpc-bidirectional");
const WebSocket = require("ws");


// The WebSocketTransport plugin requires that the WebSocket connection instance supports the `close`, `error` and `message` events of the https://github.com/websockets/ws API.
// If not using `websockets/ws`, the WebSocketTransport plugin may be extended to override WebSocketTransport._setupWebSocket().


const ws = new WebSocket("ws://localhost/api");
await new Promise((fnResolve, fnReject) => {
	ws.on("open", fnResolve);
	ws.on("error", fnReject);
});


const testClient = new TestClient("ws://localhost/api");


const webSocketTransport = new JSONRPC.Plugins.Client.WebSocketTransport(ws);
testClient.addPlugin(webSocketTransport);


const nDivisionResult = await testClient.divide(2, 1);
```


## Bi-directional JSON-RPC over WebSocket

This JSONRPC server and client can be bi-directional over __a single WebSocket connection__. 

In other words, there may be a `JSONRPC.Server` instance __and__ a `JSONRPC.Client` instance at one end, and another pair (or more) at the other end.

At the WebSocket or __TCP/HTTP server__ connection end, the `JSONRPC.Server` will automatically instantiate a `JSONRPC.Client` subclass per connection (of the class specified by the serving endpoint).


Common:

```JavaScript
// BidirectionalWebsocketRouter and the WebSocketTransport plugin both require that the WebSocket connection instance supports the `close`, `error` and `message` events of the https://github.com/websockets/ws API.
// If not using `websockets/ws`, a wrapping adapter which emits the above events must be provided (if the WebSocket implementation is not already compatible with `websockets/ws`).

// BidirectionalWebsocketRouter also uses properties on WebSocket instances to get the URL path (needed to determine the endpoint), like this: `webSocket.url ? webSocket.url : webSocket.upgradeReq.url`.

const JSONRPC = require("jsonrpc-bidirectional");
const WebSocket = require("ws");
const WebSocketServer = WebSocket.Server;
```


__Site A. WebSocket server (accepts incoming TCP connections):__

```JavaScript
const jsonrpcServer = new JSONRPC.Server();
jsonrpcServer.registerEndpoint(new TestEndpoint()); // See "Define an endpoint" section above.

// By default, JSONRPC.Server rejects all requests as not authenticated and not authorized.
jsonrpcServer.addPlugin(new JSONRPC.Plugins.Server.AuthenticationSkip());
jsonrpcServer.addPlugin(new JSONRPC.Plugins.Server.AuthorizeAll());

const wsJSONRPCRouter = new JSONRPC.BidirectionalWebsocketRouter(jsonrpcServer);

// Optional.
wsJSONRPCRouter.on("madeReverseCallsClient", (clientReverseCalls) => { /*add plugins or just setup the client even further*/ });


const webSocketServer = new WebSocketServer({port: 8080});
webSocketServer.on("error", (error) => {console.error(error); process.exit(1);});

webSocketServer.on(
	"connection", 
	async (webSocket) => 
	{
		const nWebSocketConnectionID = await wsJSONRPCRouter.addWebSocket(webSocket);
		// Do something with nWebSocketConnectionID and webSocket here, like register them as a pair with an authorization plugin .
	}
);
```


__Site B. WebSocket client (connects to the above WebSocket TCP server):__

```JavaScript
const jsonrpcServer = new JSONRPC.Server();
jsonrpcServer.registerEndpoint(new TestEndpoint()); // See "Define an endpoint" section above.

// By default, JSONRPC.Server rejects all requests as not authenticated and not authorized.
jsonrpcServer.addPlugin(new JSONRPC.Plugins.Server.AuthenticationSkip());
jsonrpcServer.addPlugin(new JSONRPC.Plugins.Server.AuthorizeAll());


const webSocket = new WebSocket("ws://localhost/api");
await new Promise((fnResolve, fnReject) => {
	webSocket.on("open", fnResolve);
	webSocket.on("error", fnReject);
});


const wsJSONRPCRouter = new JSONRPC.BidirectionalWebsocketRouter(jsonrpcServer);


const nWebSocketConnectionID = await wsJSONRPCRouter.addWebSocket(webSocket);


// Obtain single client. See above section "Extending the client" for the TestClient class (subclass of JSONRPC.Client).
const theOnlyClient = wsJSONRPCRouter.connectionIDToSingletonClient(nWebSocketConnectionID, TestClient);

await theOnlyClient.divide(3, 2);
```
