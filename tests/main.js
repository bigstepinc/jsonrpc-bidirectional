const AllTests = require("./AllTests");

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
		await (new AllTests(/*bWebSocketMode*/ false)).runTests();
		await (new AllTests(/*bWebSocketMode*/ true)).runTests();

		console.log("Finished all tests!!!");

		process.exit(0);
	}
)();
