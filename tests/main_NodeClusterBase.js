const JSONRPC = require("../index");

const cluster = require("cluster");
const assert = require("assert");
const path = require("path");

const sleep = require("sleep-promise");

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


// Keep this process alive.
setInterval(() => {}, 10000);

(
	async () =>
	{
		if(cluster.isMaster)
		{
			const endpoint = new JSONRPC.NodeClusterBase.MasterEndpoint(JSONRPC.NodeClusterBase.WorkerClient);
			await endpoint.start();
			await endpoint.watchForUpgrade(path.join(path.dirname(__dirname), "package.json"));

			let bNotReady;
			console.log("Waiting for workers to all signal they are ready.");

			do
			{
				bNotReady = false;
				for(let nID in endpoint.workerClients)
				{
					bNotReady = bNotReady || !endpoint.workerClients[nID].ready;
				}

				if(bNotReady)
				{
					await sleep(1000);
				}
			} while(bNotReady);

			console.log("All workers ready.");
			await sleep(10000000);
		}
		else
		{
			const endpoint = new JSONRPC.NodeClusterBase.WorkerEndpoint(JSONRPC.NodeClusterBase.MasterClient);
			await endpoint.start();

			assert(await endpoint.masterClient.ping("Test") === "Test", "Calling MasterEndpoint.ping() returned the wrong thing.");
			
			console.log("Will call masterClient.gracefulExit() after sleeping for 10 seconds.");
			await sleep(10 * 1000);
			// This will call all worker's gracefulExit() methods.
			await endpoint.masterClient.gracefulExit();
		}

		await sleep(1000);
		process.exit(0);
	}
)();
