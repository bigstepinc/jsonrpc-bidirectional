// Do not use const here, webpack/babel issues.
var objExport = {
	JSONRPC: require("./index")
};

objExport.JSONRPC.NodeClusterBase = null;
delete objExport.JSONRPC.NodeClusterBase;

objExport.JSONRPC.BidirectionalWorkerThreadRouter = null;
delete objExport.JSONRPC.BidirectionalWorkerThreadRouter;

module.exports = objExport;
