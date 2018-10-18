const NodeMultiCoreCPUBase = require("../NodeMultiCoreCPUBase");

/**
 * Extend this class to link to extra master RPC APIs on workers.
 */
class MasterClient extends NodeMultiCoreCPUBase.MasterClient
{
};

module.exports = MasterClient;
