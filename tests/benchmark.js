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
		const bBenchmarkMode = true;


		let nPasses = 5;
		let allTests;
		while(nPasses--)
		{
			//console.log("===== http (500 calls in parallel)");
			//allTests = new AllTests(bBenchmarkMode, /*bWebSocketMode*/ false, undefined, undefined, undefined, /*bDisableVeryLargePacket*/ true);
			//await allTests.runTests();
			//global.gc();
			//console.log("heapTotal after gc(): " + Math.round(process.memoryUsage().heapTotal / 1024 / 1024, 2) + " MB");
			//console.log("");

			// uws is consistently slower than ws when benchmarking with a few open connections (2) with the same number of calls.
			// Most of the randomness was disabled when tested.
			// Tested on nodejs 7.8.0, Windows 10, 64 bit.
			console.log("===== uws (20,000 calls in parallel, over as many reused connections as possible)");
			allTests = new AllTests(bBenchmarkMode, /*bWebSocketMode*/ true, require("uws"), require("uws").Server, JSONRPC.WebSocketAdapters.uws.WebSocketWrapper, /*bDisableVeryLargePacket*/ true);
			allTests.websocketServerPort = allTests.httpServerPort + 1;
			await allTests.runTests();
			global.gc();
			console.log("heapTotal after gc(): " + Math.round(process.memoryUsage().heapTotal / 1024 / 1024, 2) + " MB");
			console.log("");


			console.log("===== ws (20,000 calls in parallel, over as many reused connections as possible)");
			allTests = new AllTests(bBenchmarkMode, /*bWebSocketMode*/ true, require("ws"), require("ws").Server, undefined, /*bDisableVeryLargePacket*/ true);
			await allTests.runTests();
			global.gc();
			console.log("heapTotal after gc(): " + Math.round(process.memoryUsage().heapTotal / 1024 / 1024, 2) + " MB");
			console.log("");
		}

		console.log("[" + process.pid + "] Finished benchmarking.");

		process.exit(0);
	}
)();
