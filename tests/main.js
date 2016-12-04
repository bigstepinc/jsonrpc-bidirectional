const TestServer=require("./TestServer");

process.on(
	"unhandledRejection", 
	(reason, promise) => 
	{
		console.log("Unhandled Rejection at: Promise", promise, "reason", reason);
		
		process.exit(1);
	}
);

(
	async ()=>
	{
		const test=new TestServer();
		await test.fireUp();
		await test.testCalls();
		console.log("Finished all tests!!!");
		process.exit(0);
	}
)();
