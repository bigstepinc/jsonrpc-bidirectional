const JSONRPC = {};
JSONRPC.ClientPluginBase = require("../../ClientPluginBase");
JSONRPC.Utils = require("../../Utils");

const ChildProcess = require("child_process");

module.exports =
class ProcessStdIOTransport extends JSONRPC.ClientPluginBase
{
	/**
	 * @param {string} strExePath
	 * @param {string} strWorkingDirectoryPath
	 * @param {string[]} arrArguments
	 */
	constructor(strExePath, strWorkingDirectoryPath, arrArguments = [])
	{
		super();
		
		this._strExePath = strExePath;
		this._strWorkingDirectoryPath = strWorkingDirectoryPath;
		this._arrArguments = arrArguments;
	}


	/**
	 * Populates the OutgoingRequest class instance (outgoingRequest) with the RAW JSON response and the JSON parsed response object.
	 * 
	 * @param {JSONRPC.OutgoingRequest} outgoingRequest
	 * 
	 * @returns {Promise.<null>}
	 */
	async makeRequest(outgoingRequest)
	{
		if(outgoingRequest.isMethodCalled)
		{
			return;
		}

		outgoingRequest.isMethodCalled = true;
		

		const objExecOptions = {
			cwd: this._strWorkingDirectoryPath,
			maxBuffer: 10 * 1024 * 1024
		};

		const child = ChildProcess.spawn(this._strExePath, this._arrArguments, objExecOptions);

		return new Promise((fnResolve, fnReject) => {
			child.on(
				"close", 
				(code) => {
					child.stdin.end();

					fnResolve(null);
				}
			);

			outgoingRequest.responseBody = "";
			child.stdout.on(
				"data", 
				(data) => {
					outgoingRequest.responseBody += data;
				}
			);

			child.on(
				"error", 
				(error) => {
					fnReject(error);
				}
			);

			child.stdin.setEncoding("utf-8");
			child.stdin.write(outgoingRequest.requestBody);
		});
	}
};

