const NodeMultiCoreCPUBase = require("../NodeMultiCoreCPUBase");

/**
 * Extend this class to link to extra worker RPC APIs on the master.
 */
class WorkerClient extends NodeMultiCoreCPUBase.WorkerClient
{
};

module.exports = WorkerClient;
