const JSONRPC = require("..");
const AllTests = require("./Tests/AllTests");
const os = require("os");
const cluster = require("cluster");

process.on(
	"unhandledRejection", 
	(reason, promise) => 
	{
		console.log("[" + process.pid + "] Unhandled Rejection at: Promise", promise, "reason", reason);
		
		process.exit(1);
	}
);

(
	async () =>
	{
		let allTests;
		const bBenchmarkMode = false;

		if(cluster.isMaster)
		{
			allTests = new AllTests(bBenchmarkMode, /*bWebSocketMode*/ false);
			await allTests.runClusterTests();

			allTests = new AllTests(bBenchmarkMode, /*bWebSocketMode*/ false);
			await allTests.runTests();

			// uws "Segmentation fault" on .close() in Travis (CentOS 7).
			// https://github.com/uWebSockets/uWebSockets/issues/583
			//if(os.platform() === "win32")
			//{
			//	allTests = new AllTests(bBenchmarkMode, /*bWebSocketMode*/ true, require("uws"), require("uws").Server, JSONRPC.WebSocketAdapters.uws.WebSocketWrapper, /*bDisableVeryLargePacket*/ true);
			//	allTests.websocketServerPort = allTests.httpServerPort + 1;
			//	await allTests.runTests();
			//}

			allTests = new AllTests(bBenchmarkMode, /*bWebSocketMode*/ true, require("ws"), require("ws").Server, undefined, /*bDisableVeryLargePacket*/ false);
			await allTests.runTests();

			console.log("[" + process.pid + "] Done!!!");
		}
		else
		{
			allTests = new AllTests(bBenchmarkMode, /*bWebSocketMode*/ false);
			await allTests.runClusterTests();

			console.log("[" + process.pid + "] Worker done!!!");
		}
		

		process.exit(0);
	}
)();
