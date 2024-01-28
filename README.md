# concurrent-promise-queue

A small utility for throttling the rate at which promises are executed.

It can set a maximum number of promises to run concurrently, for example running a list of promises 1 or 2 at a time.

It can run promises according to a time based rate-limit, for example running at most 1 promise every second, or 10 promises every 5 seconds.

## installation
```shell
npm install --save concurrent-promise-queue
```

## Use case

Generally this is useful if you have a lot of resources to call, but you do not want to overload your server by attempting to do them all at the same time.

For example, making 100 HTTP Requests, if all 100 Requests occur at the same time it is likely the server will run out of memory on a small server.
So using Concurrent Promise Queue allows the server to process say, 5 at a time, to ensure it does not run out of memory.

## Usage

### Execute promises in series
```js
import {ConcurrentPromiseQueue} from "concurrent-promise-queue";
// Setting maxNumberOfConcurrentPromises to 1 means promises will be run one after another
const queue = new ConcurrentPromiseQueue({ maxNumberOfConcurrentPromises: 1 });

return Promise.all([
  queue.addPromise(() => callApi('/book/1')),
  queue.addPromise(() => callApi('/book/2')),
  queue.addPromise(() => callApi('/book/3')),
  queue.addPromise(() => callApi('/book/4')),
  queue.addPromise(() => callApi('/book/5')),
  queue.addPromise(() => callApi('/book/6')),
])
  .then(results => {
    // do something with the results
    return results
  })
```

```
0s - Called /book/1
1s - Called /book/2
2s - Called /book/3
3s - Called /book/4
4s - Called /book/5
5s - Called /book/6
```

### Execute promises in parallel
```js
import {ConcurrentPromiseQueue} from "concurrent-promise-queue";
// Setting maxNumberOfConcurrentPromises to 2 
// means that at most, 2 promises will be executed at any one time
const queue = new ConcurrentPromiseQueue({ maxNumberOfConcurrentPromises: 2 });

return Promise.all([
  queue.addPromise(() => callApi('/book/1')),
  queue.addPromise(() => callApi('/book/2')),
  queue.addPromise(() => callApi('/book/3')),
  queue.addPromise(() => callApi('/book/4')),
  queue.addPromise(() => callApi('/book/5')),
  queue.addPromise(() => callApi('/book/6')),
])
  .then(results => {
    // do something with the results
    return results
  })
```

The queue will start new promises to maintain the concurrency limit.
```
0s - Called /book/1
0s - Called /book/2
1s - Called /book/3
1s - Called /book/4
2s - Called /book/5
2s - Called /book/6
```

### Execute promises with a time-based rate limit
```js
import {ConcurrentPromiseQueue} from "concurrent-promise-queue";
// Setting unitOfTimeMillis to 4000
// Setting maxThroughputPerUnitTime to 2
// means that at most, 2 promises will be executed per 4 seconds
const queue = new ConcurrentPromiseQueue({
  unitOfTimeMillis: 4000,
  maxThroughputPerUnitTime: 2,
});

return Promise.all([
  queue.addPromise(() => callApi('/book/1')),
  queue.addPromise(() => callApi('/book/2')),
  queue.addPromise(() => callApi('/book/3')),
  queue.addPromise(() => callApi('/book/4')),
  queue.addPromise(() => callApi('/book/5')),
  queue.addPromise(() => callApi('/book/6')),
])
  .then(results => {
    // do something with the results
    return results
  })
```

The queue will start new promises to maintain the concurrency limit.
```
0s - Called /book/1
0s - Called /book/2
4s - Called /book/3
4s - Called /book/4
8s - Called /book/5
8s - Called /book/6
```

