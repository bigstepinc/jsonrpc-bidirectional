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
		await (new TestServer()).runTests();

		process.exit(0);
	}
)();
