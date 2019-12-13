const JSONRPC = require("..");
const AllTests = require("./Tests/AllTests");

process.on(
	"unhandledRejection", 
	(reason, promise) => 
	{
		console.log("[" + process.pid + "] Unhandled Rejection at: Promise", promise, "reason", reason);
		
		process.exit(1);
	}
);

// https://github.com/uWebSockets/uWebSockets/issues/586

(
	async() =>
	{
		const bBenchmarkMode = false;

		const allTests = new AllTests(bBenchmarkMode, /*bWebSocketMode*/ true, require("uws"), require("uws").Server, JSONRPC.WebSocketAdapters.uws.WebSocketWrapper, /*bDisableVeryLargePacket*/ true);
		allTests.bAwaitServerClose = true;
		allTests.websocketServerPort = allTests.httpServerPort + 1;
		await allTests.runTests();

		console.log("[" + process.pid + "] Done!!!");

		process.exit(0);
	}
)();
