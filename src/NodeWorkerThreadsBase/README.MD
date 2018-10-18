# Node worker threads RPC base

Useful extendable endpoint classes for easily scaling to all CPUs using node worker threads. 

Unlike the JSONRPC library, these classes act like an application base (framework), to automatically manage the worker threads' lifecycle and communication with them.

The endpoints come with self-hosted JSONRPC.Server configured with `../Plugins/Client/WorkerThreadTransport.js` and `../BidirectionalWorkerThreadRouter.js`.

It is a fast starting point when scaling to all CPUs using worker threads, as it also manages the worker thread lifecycle. However, it might not be very flexible.

The master process is also a master RPC service. All RPCs should go to or through it (for example, a worker thread's API call to another worker thread would have to be API-proxied through the master).

Potentially (but not limited to) the clients could be used to send API calls to all worker threads, or specific worker threads, load balance workload to worker threads or share the results of an expensive operation with all worker threads while only running it once.

To use, simply instantiate a `MasterEndpoint` subclass in the master process and a `WorkerEndpoint` subclass in the worker process, and call their respective `.start()` methods.

The main advantage of using Worker Threads and not the Cluster module (basically forked child processes) is shared memory between threads. For example, the master process could be used to keep a collection references to SharedArrayBuffer instances and then worker threads could ask (using RPC APIs naturally) for a specific SharedArrayBuffer reference when first needed.

The greatest disadvantage of using Worker Threads is instability. The cluster module uses separate processes, which when crash have no side effects on the master process and release all their allocated memory. Worker Threads on the other hand have several issues:
 * Before crashing with uncaught errors or not handled rejected promises a sleep of a few seconds is required to wait for stdout and stderr to finish flushing into the main thread's stdout and stderr, or else they are lost forever, losing important debugging information.
 * The NodeJS documentation states that [terminating worker threads at the wrong time](https://nodejs.org/api/worker_threads.html#worker_threads_worker_terminate_callback) could crash the whole process (which also means the main thread and all other threads): _Warning: Currently, not all code in the internals of Node.js is prepared to expect termination at arbitrary points in time and may crash if it encounters that condition. Consequently, you should currently only call .terminate() if it is known that the Worker thread is not accessing Node.js core modules other than what is exposed in the worker module._ __When using this "framework" (JSONRPC.NodeWorkerThreadsBase) this problem is alleviated__ because the master endpoint never tries to terminate worker threads (worker threads are alive forever and do whatever work multiple RPC API calls ask for). Worker threads may terminate on their own because of an unrecoverable error though (bad error handling: uncaught error or not handled promise rejection).

From the NodeJS documentation on Worker Threads:

_Workers are useful for performing CPU-intensive JavaScript operations; do not use them for I/O, since Node.js’s built-in mechanisms for performing operations asynchronously already treat it more efficiently than Worker threads can._

_Workers, unlike child processes or when using the cluster module, can also share memory efficiently by transferring ArrayBuffer instances or sharing SharedArrayBuffer instances between them._


Usage:
```Javascript
const WorkerThreadsRPC = require("./YourWorkersRPCSubclasses");
const Threads = require("worker_threads");

(async () => {
  if(Threads.isMainThread)
  {
    const masterEndpoint = new WorkerThreadsRPC.MasterEndpoint(/*your custom params*/);
    await masterEndpoint.start();
    
    // Optional: 
    await masterEndpoint.watchForUpgrades("/path/to/package.json");
  }
  else
  {
    const workerEndpoint = new WorkerThreadsRPC.WorkerEndpoint(/*your custom params*/);
    await workerEndpoint.start();
  }  
})();

