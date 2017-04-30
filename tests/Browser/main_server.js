// Use this CLI server to support browser development, debugging or manual testing.

const AllTests = require("../AllTests");

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
		const allTests = new AllTests(/*bBenchmarkMode*/ false, /*bWebSocketMode*/ true, require("ws"), require("ws").Server, undefined, /*bDisableVeryLargePacket*/ false);
		await allTests.setupHTTPServer();
		await allTests.setupWebsocketServerSiteA();
		await allTests.disableServerSecuritySiteA();

		console.log("Go to http://localhost:" + allTests.httpServerPort + "/tests/Browser/index.html?websocketmode=1&websocketsport=" + allTests.websocketServerPort);
	}
)();
