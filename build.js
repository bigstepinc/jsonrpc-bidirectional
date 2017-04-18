const exec = require("child_process").exec;
const fs = require("fs");
const path = require("path");


// Avoiding "DeprecationWarning: Unhandled promise rejections are deprecated. In the future, promise rejections that are not handled will terminate the Node.js process with a non-zero exit code."
// by actually doing the respective exit with non-zero code.
// This allows the watcher to restart this process.
process.on(
	"unhandledRejection", 
	async (reason, promise) => 
	{
		console.log("Unhandled Rejection at: Promise", promise, "reason", reason);
		process.exit(1);
	}
);


async function runCLICommand(strCommand)
{
	const processCommand = exec(strCommand);
	processCommand.stdout.pipe(process.stdout);
	processCommand.stderr.pipe(process.stderr);
	return new Promise(async (fnResolve, fnReject) => {
		processCommand.on("error", fnReject);
		processCommand.on("exit", (nCode) => {
			if(nCode === 0)
			{
				fnResolve();
			}
			else
			{
				fnReject(new Error("Failed with error code " + nCode));
			}
		});
	});
}


(async () => {
	const objPackageJSON = JSON.parse(fs.readFileSync("package.json"));

	const arrVersionParts = objPackageJSON.version.split(".");
	arrVersionParts[arrVersionParts.length - 1] = parseInt(arrVersionParts[arrVersionParts.length - 1], 10);
	arrVersionParts[arrVersionParts.length - 1]++;
	objPackageJSON.version = arrVersionParts.join(".");
	fs.writeFileSync("package.json", JSON.stringify(objPackageJSON, undefined, "  "));


	console.log("Building.");
	await runCLICommand(path.resolve("./node_modules/.bin/webpack"));
	//process.chdir(__dirname);
	
	console.log("Done.");
})();

