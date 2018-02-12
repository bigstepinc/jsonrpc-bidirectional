# Node cluster RPC base

Useful extendable endpoint classes for easily scaling to all CPUs using node workers.

The endpoints come with self-hosted JSONRPC.Server configured with `../Plugins/Client/WorkerTransport.js` and `../BidirectionalWorkerRouter.js`.

It is a fast starting point when clustering, as it also manages the worker lifecycle. However, it might not be very flexible.

The master process is also a master RPC service. All RPCs should go to or through it (for example, a worker's API call to another worker would have to be API-proxied through the master).

Potentially (but not limited to) the clients could be used to send API calls to all workers, or specific workers, load balance workload to workers or share the results of an expensive operation with all workers while only running it once.

To use, simply instantiate a `MasterEndpoint` subclass in the master process and a `WorkerEndpoint` subclass in the worker process, and call their respective `.start()` methods.

Usage:
```Javascript
const WorkersRTC = require("./YourWorkersRTCExtendedClasses");
const cluster = require("cluster");

(async () => {
  if(cluster.isMaster)
  {
    const masterEndpoint = new WorkersRTC.MasterEndpoint(/*your custom params*/);
    await masterEndpoint.start();
    
    // Optional: 
    await masterEndpoint.watchForUpgrades("/path/to/package.json");
  }
  else
  {
    const workerEndpoint = new WorkersRTC.WorkerEndpoint(/*your custom params*/);
    await workerEndpoint.start();
  }  
})();

