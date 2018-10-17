const ChildProcess = require("child_process");
const fs = require("fs");
const os = require("os");
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
	const objPackageJSON = JSON.parse(fs.readFileSync("package.json"));

	const arrVersionParts = objPackageJSON.version.split(".");
	arrVersionParts[arrVersionParts.length - 1] = parseInt(arrVersionParts[arrVersionParts.length - 1], 10);
	arrVersionParts[arrVersionParts.length - 1]++;
	objPackageJSON.version = arrVersionParts.join(".");
	fs.writeFileSync("package.json", JSON.stringify(objPackageJSON, undefined, "  "));


	console.log("Building.");
	await spawnPassthru(path.resolve("./node_modules/.bin/webpack" + (os.platform() === "win32" ? ".cmd" : "")));
	//process.chdir(__dirname);
	
	console.log("Done.");
})();

