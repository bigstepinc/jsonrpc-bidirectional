const ChildProcess = require("child_process");
const chalk = require("chalk");
const os = require("os");


// Avoiding "DeprecationWarning: Unhandled promise rejections are deprecated. In the future, promise rejections that are not handled will terminate the Node.js process with a non-zero exit code."
// by actually doing the respective exit with non-zero code.
// This allows the watcher to restart this process.
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


async function spawnPassthru(strExecutablePath, arrParams = [])
{
	const childProcess = ChildProcess.spawn(strExecutablePath, arrParams, {stdio: "inherit"});
	//childProcess.stdout.pipe(process.stdout);
	//childProcess.stderr.pipe(process.stderr);
	return new Promise(async(fnResolve, fnReject) => {
		childProcess.on("error", fnReject);
		childProcess.on("exit", (nCode) => {
			if(nCode === 0)
			{
				fnResolve();
			}
			else
			{
				fnReject(new Error(`Exec process exited with error code ${nCode}`));
			}
		});
	});
}


(async () => {
	process.chdir(__dirname);

	console.log(chalk.bgWhite.black("npm run test_lib"));
	await spawnPassthru("npm" + (os.platform() === "win32" ? ".cmd" : ""), ["run", "test_lib"]);

	console.log(chalk.bgWhite.black("npm run test_cluster"));
	await spawnPassthru("npm" + (os.platform() === "win32" ? ".cmd" : ""), ["run", "test_cluster"]);

	console.log(chalk.bgWhite.black("npm run test_worker_threads"));
	await spawnPassthru("npm" + (os.platform() === "win32" ? ".cmd" : ""), ["run", "test_worker_threads"]);

	// @TODO: automate test_rtc using headless Chrome.
	// console.log(chalk.bgWhite.black("npm run test_rtc"));
	// await spawnPassthru("npm" + (os.platform() === "win32" ? ".cmd" : ""), ["run", "test_rtc"]);
})();

