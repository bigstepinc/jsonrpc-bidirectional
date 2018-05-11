const JSONRPC = {};
JSONRPC.ClientPluginBase = require("../../ClientPluginBase");
JSONRPC.Utils = require("../../Utils");

const ChildProcess = require("child_process");

module.exports =
class ProcessStdIOTransport extends JSONRPC.ClientPluginBase
{
	/**
	 * @param {string} strEndpointCommand
	 * @param {string} strWorkingDirectoryPath
	 */
	constructor(strEndpointCommand, strWorkingDirectoryPath)
	{
		super();
		
		this._strEndpointCommand = strEndpointCommand;
		this._strWorkingDirectoryPath = strWorkingDirectoryPath;
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

		const strExePath = this._strEndpointCommand.trim().split(/[\s]+/, 1)[0];
		const strArguments = this._strEndpointCommand.substr(strExePath.length).trim();
		
		const child = ChildProcess.spawn(strExePath, [strArguments], objExecOptions);

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

			function errorHandler(error)
			{
				// Stream errors sometimes don't have a proper stacktrace or enough information to know where they are coming from.
				console.error(outgoingRequest);
				console.error(error);
				
				fnReject(error);
			}
			
			child.on("error", errorHandler);
			child.stdin.on("error", errorHandler);
			child.stdout.on("error", errorHandler);

			child.stdin.setEncoding("utf-8");
			child.stdin.write(outgoingRequest.requestBody);
		});
	}
};

