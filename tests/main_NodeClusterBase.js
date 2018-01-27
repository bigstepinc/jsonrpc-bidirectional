const JSONRPC = require("..");

const cluster = require("cluster");
const assert = require("assert");
const path = require("path");

const sleep = require("sleep-promise");


process.on(
	"unhandledRejection", 
	(reason, promise) => 
	{
		console.log("[" + process.pid + "] Unhandled Rejection at: Promise", promise, "reason", reason);
		
		process.exit(1);
	}
);

process.on(
	"uncaughtException",
	(error) => {
		console.log("[" + process.pid + "] Unhandled exception.");
		console.error(error);

		process.exit(1);
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
			
			console.log("Will call masterClient.gracefulExit().");
			await sleep(40000);
			// This will call all worker's gracefulExit() methods.
			await endpoint.masterClient.gracefulExit();
		}

		await sleep();
		process.exit(0);
	}
)();
