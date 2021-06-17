# concurrent-promise-queue

A small utility for throttling the rate at which promises are executed.

## installation
```shell
npm install concurrent-promise-queue
```

## Use case

This utility was written because I was trying to call a lot of external APIs from a small node server
and found that trying to start 5000 promises that perform API calls would crash my server and also 
trigger the external APIs to return a 429 too many requests response.

By throttling how many promises can be performed the memory footprint of performing thousands of 
promises can be controlled, and the number of calls to external APIs can be kept within their rate limits.

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
08:44:38.289Z - Calling /book/1
08:44:41.187Z - Called /book/1
08:44:41.187Z - Calling /book/2
08:44:43.744Z - Called /book/2
08:44:43.744Z - Calling /book/3
08:44:46.358Z - Called /book/3
08:44:46.359Z - Calling /book/4
08:44:48.914Z - Called /book/4
08:44:48.914Z - Calling /book/5
08:44:50.794Z - Called /book/5
08:44:50.794Z - Calling /book/6
08:44:52.203Z - Called /book/6
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
Some API calls take longer than others, the queue will start new promises to maintain the concurrency limit.
```
08:49:34.190Z - Calling /book/1
08:49:34.190Z - Calling /book/2
08:49:35.545Z - Called /book/1
08:49:35.545Z - Calling /book/3
08:49:36.093Z - Called /book/2
08:49:36.094Z - Calling /book/4
08:49:37.829Z - Called /book/3
08:49:37.830Z - Calling /book/5
08:49:37.836Z - Called /book/4
08:49:37.837Z - Calling /book/6
08:49:40.276Z - Called /book/6
08:49:40.535Z - Called /book/5
```
