// Use this CLI server to support browser development, debugging or manual testing.

const AllTests = require("../Tests/AllTests");

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

		console.log("Go to http://localhost:" + allTests.httpServerPort + "/tests/BrowserWebRTC/WebRTC.html?websocketsport=" + allTests.websocketServerPort);
	}
)();
