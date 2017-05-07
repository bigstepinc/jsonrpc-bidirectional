/* eslint-disable */

var jsonrpcServer = new JSONRPC.Server();
jsonrpcServer.registerEndpoint(new TestEndpoint());

// By default, JSONRPC.Server rejects all requests as not authenticated and not authorized.
jsonrpcServer.addPlugin(new JSONRPC.Plugins.Server.AuthenticationSkip());
jsonrpcServer.addPlugin(new JSONRPC.Plugins.Server.AuthorizeAll());

jsonrpcServer.addPlugin(new JSONRPC.Plugins.Server.DebugLogger());

var workerJSONRPCRouter = new JSONRPC.BidirectionalWorkerRouter(jsonrpcServer);



workerJSONRPCRouter.addWorker(self, "/api")
	.then(function(nConnectionID){
		var client = workerJSONRPCRouter.connectionIDToSingletonClient(nConnectionID, JSONRPC.Client);

		client.rpc("rpc.connectToEndpoint", ["/api"])
			.then(function(mxResponse){
				console.log("Sent rpc.connectToEndpoint and received ", mxResponse);
			})
			.catch(console.error)
		;
	})
;
