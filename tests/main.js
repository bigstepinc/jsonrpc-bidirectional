const sleep = require("sleep-promise");

const JSONRPC = require("..");
const AllTests = require("./Tests/AllTests");

const os = require("os");
const cluster = require("cluster");
const Threads = require("worker_threads");


process.on(
	"unhandledRejection", 
	async(reason, promise) => 
	{
		console.log("[" + process.pid + "] Unhandled Rejection at: Promise", promise, "reason", reason);
		
		if(!Threads.isMainThread)
		{
			// Give time for thread to flush to stdout.
			await sleep(2000);
		}

		process.exit(1);
	}
);

process.on(
	"uncaughtException",
	async(error) => {
		console.log("[" + process.pid + "] Unhandled exception.");
		console.error(error);
		
		if(!Threads.isMainThread)
		{
			// Give time for thread to flush to stdout.
			await sleep(2000);
		}

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
			await allTests.runThreadsTests();

			if(Threads.isMainThread)
			{
				allTests = new AllTests(bBenchmarkMode, /*bWebSocketMode*/ false);
				await allTests.runClusterTests();
	
				allTests = new AllTests(bBenchmarkMode, /*bWebSocketMode*/ false);
				await allTests.runTests();
	
				// uws "Segmentation fault" on .close() in Travis (CentOS 7).
				// https://github.com/uWebSockets/uWebSockets/issues/583
				if(os.platform() === "win32")
				{
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
						allTests = new AllTests(bBenchmarkMode, /*bWebSocketMode*/ true, require("uws"), require("uws").Server, JSONRPC.WebSocketAdapters.uws.WebSocketWrapper, /*bDisableVeryLargePacket*/ true);
						allTests.websocketServerPort = allTests.httpServerPort + 1;
						await allTests.runTests();
					}
				}
	
				allTests = new AllTests(bBenchmarkMode, /*bWebSocketMode*/ true, require("ws"), require("ws").Server, undefined, /*bDisableVeryLargePacket*/ false);
				await allTests.runTests();
	
				console.log("");
				console.log("[" + process.pid + "] \x1b[42m\x1b[30mAll tests done. No uncaught errors encountered.\x1b[0m Which means all is good or the tests are incomplete/buggy.");
				console.log("");
			}
		}
		else
		{
			allTests = new AllTests(bBenchmarkMode, /*bWebSocketMode*/ false);
			await allTests.runClusterTests();

			console.log("[" + process.pid + "] \x1b[32mWorker done!!!\x1b[0m");
		}
		

		process.exit(0);
	}
)();
