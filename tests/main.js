const TestServer = require("./TestServer");

process.on(
	"unhandledRejection", 
	(reason, promise) => 
	{
		console.log("Unhandled Rejection at: Promise", promise, "reason", reason);
		
		process.exit(1);
	}
);

(
	async () =>
	{
		//await (new TestServer(/*bWebSocketMode*/ false)).runTests();
		await (new TestServer(/*bWebSocketMode*/ true)).runTests();

		console.log("Finished all tests!!!");

		process.exit(0);
	}
)();
