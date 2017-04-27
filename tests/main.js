const JSONRPC = require("..");
const AllTests = require("./AllTests");

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
		const bBenchmarkMode = false;

		let allTests = new AllTests(bBenchmarkMode, /*bWebSocketMode*/ false);
		await allTests.runTests();

		//allTests = new AllTests(bBenchmarkMode, /*bWebSocketMode*/ true, require("uws"), require("uws").Server, JSONRPC.WebSocketAdapters.uws.WebSocketWrapper, /*bDisableVeryLargePacket*/ true);
		//allTests.websocketServerPort = allTests.httpServerPort + 1;
		//await allTests.runTests();

		allTests = new AllTests(bBenchmarkMode, /*bWebSocketMode*/ true, require("ws"), require("ws").Server, undefined, /*bDisableVeryLargePacket*/ false);
		await allTests.runTests();
		
		console.log("[" + process.pid + "] Done!!!");

		process.exit(0);
	}
)();
