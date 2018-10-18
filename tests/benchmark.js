const JSONRPC = require("../index");
const AllTests = require("./Tests/AllTests");

const sleep = require("sleep-promise");

const chalk = require("chalk");

let Threads;
try
{
	Threads = require("worker_threads");
}
catch(error)
{
	// console.error(error);
}

process.on(
	"unhandledRejection", 
	async(reason, promise) => 
	{
		console.log("[" + process.pid + (Threads && !Threads.isMainThread ? ` worker thread ID ${Threads.threadId}` : "") + "] Unhandled Rejection at: Promise", promise, "reason", reason);
		process.exitCode = 1;
		
		if(Threads && !Threads.isMainThread)
		{
			// Give time for thread to flush to stdout.
			await sleep(2000);
		}

		process.exit(process.exitCode);
	}
);

process.on(
	"uncaughtException",
	async(error) => {
		console.log("[" + process.pid + (Threads && !Threads.isMainThread ? ` worker thread ID ${Threads.threadId}` : "") + "] Unhandled exception.");
		console.error(error);
		process.exitCode = 1;
		
		if(Threads && !Threads.isMainThread)
		{
			// Give time for thread to flush to stdout.
			await sleep(2000);
		}

		process.exit(process.exitCode);
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
			console.log("heapTotal before first benchmark: " + Math.round(process.memoryUsage().heapTotal / 1024 / 1024, 2) + " MB");

			//console.log("===== http (500 calls in parallel)");
			//allTests = new AllTests(bBenchmarkMode, /*bWebSocketMode*/ false, undefined, undefined, undefined, /*bDisableVeryLargePacket*/ true);
			//await allTests.runTests();
			//global.gc();
			//console.log("heapTotal after gc(): " + Math.round(process.memoryUsage().heapTotal / 1024 / 1024, 2) + " MB");
			//console.log("");

			// uws is consistently slower than ws when benchmarking with a few open connections (2) with the same number of calls.
			// Most of the randomness was disabled when tested.
			// Tested on nodejs 7.8.0, Windows 10, 64 bit.
			// https://github.com/uWebSockets/uWebSockets/issues/585


			console.log(chalk.cyan("===== ws (RPC API calls in parallel, over as many reused connections as possible)"));
			allTests = new AllTests(bBenchmarkMode, /*bWebSocketMode*/ true, require("ws"), require("ws").Server, undefined, /*bDisableVeryLargePacket*/ true);
			await allTests.runTests();
			global.gc();
			console.log("heapTotal after gc(): " + Math.round(process.memoryUsage().heapTotal / 1024 / 1024, 2) + " MB");
			console.log("");
			

			let bUwsLoaded = false;
			try
			{
				// Requires a compilation toolset to be installed if precompiled binaries are not available.
				require("uws");
				bUwsLoaded = true;
			}
			catch(error)
			{
				console.error(error);
			}

			if(bUwsLoaded)
			{
				console.log(chalk.cyan("===== uws (RPC API calls in parallel, over as many reused connections as possible)"));
				allTests = new AllTests(bBenchmarkMode, /*bWebSocketMode*/ true, require("uws"), require("uws").Server, JSONRPC.WebSocketAdapters.uws.WebSocketWrapper, /*bDisableVeryLargePacket*/ true);
				allTests.websocketServerPort = allTests.httpServerPort + 1;
				await allTests.runTests();
				global.gc();
				console.log("heapTotal after gc(): " + Math.round(process.memoryUsage().heapTotal / 1024 / 1024, 2) + " MB");
				console.log("");


				console.log(chalk.cyan("===== uws.Server, ws.Client (RPC API calls in parallel, over as many reused connections as possible)"));
				allTests = new AllTests(bBenchmarkMode, /*bWebSocketMode*/ true, require("ws"), require("uws").Server, JSONRPC.WebSocketAdapters.uws.WebSocketWrapper, /*bDisableVeryLargePacket*/ true);
				allTests.websocketServerPort = allTests.httpServerPort + 1;
				await allTests.runTests();
				global.gc();
				console.log("heapTotal after gc(): " + Math.round(process.memoryUsage().heapTotal / 1024 / 1024, 2) + " MB");
				console.log("");


				console.log(chalk.cyan("===== ws.Server, uws.Client (RPC API API calls in parallel, over as many reused connections as possible)"));
				allTests = new AllTests(bBenchmarkMode, /*bWebSocketMode*/ true, require("uws"), require("ws").Server, JSONRPC.WebSocketAdapters.uws.WebSocketWrapper, /*bDisableVeryLargePacket*/ true);
				allTests.websocketServerPort = allTests.httpServerPort + 1;
				await allTests.runTests();
				global.gc();
				console.log("heapTotal after gc(): " + Math.round(process.memoryUsage().heapTotal / 1024 / 1024, 2) + " MB");
				console.log("");
			}
		}

		console.log("[" + process.pid + "] Finished benchmarking.");

		process.exit(0);
	}
)();
