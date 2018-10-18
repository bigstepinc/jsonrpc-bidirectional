# Node cluster RPC base

Useful extendable endpoint classes for easily scaling to all CPUs using node workers.

Unlike the JSONRPC library, these classes act like an application base (framework), to automatically manage the workers' lifecycle and communication with them.

The endpoints come with self-hosted JSONRPC.Server configured with `../Plugins/Client/WorkerTransport.js` and `../BidirectionalWorkerRouter.js`.

It is a fast starting point when clustering, as it also manages the worker lifecycle. However, it might not be very flexible.

The master process is also a master RPC service. All RPCs should go to or through it (for example, a worker's API call to another worker would have to be API-proxied through the master).

Potentially (but not limited to) the clients could be used to send API calls to all workers, or specific workers, load balance workload to workers or share the results of an expensive operation with all workers while only running it once.

To use, simply instantiate a `MasterEndpoint` subclass in the master process and a `WorkerEndpoint` subclass in the worker process, and call their respective `.start()` methods.

The cluster module uses separate forked child processes, which when crash have no side effects on the master process and release all their allocated memory. This is the best and safest method for scaling to all CPUs, unless SharedArrayBuffer support is needed which is not supported when multiple forked child processes are involved. See NodeWorkerThreadsBase for using the Worker Threads NodeJS module instead, which supports SharedArrayBuffer.

Usage:
```Javascript
const WorkersRPC = require("./YourWorkersRPCSubclasses");
const cluster = require("cluster");

(async () => {
  if(cluster.isMaster)
  {
    const masterEndpoint = new WorkersRPC.MasterEndpoint(/*your custom params*/);
    await masterEndpoint.start();
    
    // Optional: 
    await masterEndpoint.watchForUpgrades("/path/to/package.json");
  }
  else
  {
    const workerEndpoint = new WorkersRPC.WorkerEndpoint(/*your custom params*/);
    await workerEndpoint.start();
  }  
})();

