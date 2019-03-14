const sleep = require("sleep-promise");

// const JSONRPC = require("..");
const AllTests = require("./Tests/AllTests");

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

		const allTests = new AllTests(bBenchmarkMode, /*bWebSocketMode*/ true, require("ws"), require("ws").Server, undefined, /*bDisableVeryLargePacket*/ true);
		await allTests.runThreadTransferListTest();

		process.exit(0);
	}
)();
