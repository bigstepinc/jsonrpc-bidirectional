# Node cluster RPC base

Useful extendable classes, built around `../Plugins/Client/WorkerTransport.js` and `../BidirectionalWorkerRouter.js`.

Not intended as a reusable works-for-everything wrapper around WorkerTransport and BidirectionalWorkerRouter.

It is a good starting point when clustering, as it also manages the worker lifecycle.

The master process is also a master RPC service. All RPC communication should go to or through it (for example, a worker's API call to another worker would have to be API-proxied through the master).

Potentially (but not limited to) it could act to send API calls to all workers, or specific workers, load balance workload to workers or share the results of an expensive operation with all workers while only running it once.
