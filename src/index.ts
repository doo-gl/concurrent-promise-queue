
import { v4 as uuid } from 'uuid';

export type PromiseSupplier<T> = () => Promise<T>;

type PromiseExecutionListener<T> = (result:FinishedPromiseResult<T>) => void;
interface FinishedPromiseResult<T> {
  isSuccess:boolean,
  result:T,
  error:any,
}
interface QueuedPromise<T> {
  id:string,
  promiseSupplier:PromiseSupplier<T>
  promise:Promise<T>|null,
  result:FinishedPromiseResult<T>|null,
  listener:PromiseExecutionListener<T>
  dependencies:Set<string>,
}

export interface QueueOptions {
  /**
   * The maximum concurrency factor for the queue.
   * This will throttle the number of promises that can be processed at one time.
   * Defaults to 1000 if not specified.
   */
  maxNumberOfConcurrentPromises?:number,
  /**
   * The unit of time for rate limiting, in milliseconds.
   * This will decide how large the time window is that promises are throttled in.
   * Defaults to 100ms if not specified.
   */
  unitOfTimeMillis?:number,
  /**
   * The maximum number of promises to process in the rate limiting time window.
   * Defaults to 1000 if not specified.
   */
  maxThroughputPerUnitTime?:number,
  /**
   * When true, the queue will resolve promises currently running before moving on to more promises.
   * This guarantees that all promises will resolve in the order that they were added to the queue,
   * however, in order to fulfil this guarantee, the queue delays resolving promises that finished earlier.
   * This will mean that the queue will hold references to objects that could have been resolved earlier.
   *
   * The queue will still execute promises according to the capacity configured for the queue, but the resolution of the promise returned from the queue will change
   *
   * By default, this option is false,
   */
  resolveInOrder?:boolean,
}

export class ConcurrentPromiseQueue {
  private readonly maxNumberOfConcurrentPromises:number;
  private readonly unitOfTimeMillis:number;
  private readonly maxThroughputPerUnitTime:number;
  private readonly resolveInOrder:boolean;
  private promisesToExecute:Array<QueuedPromise<any>>;
  private promisesBeingExecuted:{[id:string]: QueuedPromise<any>};
  private promisesWaitingToResolve:{[id:string]: QueuedPromise<any>};
  private promiseExecutedCallbacks:{[id:string]:PromiseExecutionListener<any>};
  private promiseCompletedTimesLog:Date[];
  private reattemptTimeoutId:NodeJS.Timeout|null;
  private previousPromiseId:string|null = null;

  constructor(options:QueueOptions) {
    this.maxNumberOfConcurrentPromises = options.maxNumberOfConcurrentPromises ?? 1000;
    this.unitOfTimeMillis = options.unitOfTimeMillis ?? 100;
    this.maxThroughputPerUnitTime = options.maxThroughputPerUnitTime ?? 1000;
    this.resolveInOrder = options.resolveInOrder ?? false;
    this.promisesToExecute = [];
    this.promisesBeingExecuted = {};
    this.promisesWaitingToResolve = {};
    this.promiseExecutedCallbacks = {};
    this.promiseCompletedTimesLog = [];
    this.reattemptTimeoutId = null;
  }

  numberOfQueuedPromises():number {
    return this.promisesToExecute.length
  }

  numberOfExecutingPromises():number {
    return Object.keys(this.promisesBeingExecuted).length;
  }

  /**
   * The queue takes a function that returns a promise.
   * This function will be called at the point where the promise is going to be executed.
   *
   * @param promiseSupplier - A function that returns a promise.
   */
  addPromise<T>(promiseSupplier:PromiseSupplier<T>):Promise<T> {
    // return a promise that will complete when the promise from the promise supplier has been run.
    return new Promise(((resolve, reject) => {
      // add the promise to list of promises to be executed and also register a callback with the same id
      // so that when this promise has been executed, we can call the callback and resolve the promise to return to the caller
      const id = uuid();

      const listener = (result:FinishedPromiseResult<T>) => {

        delete this.promisesWaitingToResolve[id]

        if (result.isSuccess) {
          resolve(result.result);
        } else {
          reject(result.error);
        }
      };

      const dependencies = new Set<string>()
      if (this.resolveInOrder) {
        // if we need to resolve in the order promises were added
        // check to see if the previously added promise ID still matches a promise that is running or going to run
        // if so, add a dependency so this promise can only resolve once the previous one has resolved
        const isPreviousPromiseStillActive = !!this.previousPromiseId
          && (
            this.promisesToExecute.some(pr => pr.id === this.previousPromiseId)
            || !!this.promisesBeingExecuted[this.previousPromiseId]
          )
        if (isPreviousPromiseStillActive && this.previousPromiseId) {
          dependencies.add(this.previousPromiseId)
        }
      }

      this.promisesToExecute.push({
        id,
        promiseSupplier,
        listener,
        dependencies,
        promise: null,
        result: null,
      });
      this.promiseExecutedCallbacks[id] = listener
      this.previousPromiseId = id;
      // call execute to kick off the processing of promises if it hasn't already started.
      this.execute();
    }));
  }

  private onPromiseFinished(id:string) {
    // get the current state of this promise
    const thisPromise = this.promisesBeingExecuted[id] ?? this.promisesWaitingToResolve[id];

    // if this promise does not exist or is not ready to resolve yet, end
    // this promise will be resolved when one of its dependencies finishes
    if (!thisPromise || thisPromise.dependencies.size > 0 || !thisPromise.result) {
      return
    }

    // otherwise, resolve this promise and go on to remove it as a dependency from all other promises
    thisPromise.listener(thisPromise.result);

    const promisesThatDependOnThisPromise = this.promisesToExecute
      .concat(Object.values(this.promisesBeingExecuted))
      .concat(Object.values(this.promisesWaitingToResolve))
      .filter(pr => pr.dependencies.has(id))


    promisesThatDependOnThisPromise.forEach(otherPromise => {
      // remove the promise that has just resolved from the dependencies
      // the other promise no longer depends on it because it is now done
      otherPromise.dependencies.delete(id)

      // if the other promise has finished, call this function to retry calling its listeners and the listeners that depend on it
      if (otherPromise.result) {
        this.onPromiseFinished(otherPromise.id)
      }

    })
  }

  execute():void {
    // check to see if we have anything to execute
    if (this.promisesToExecute.length === 0) {
      return;
    }

    // check to see how many promises have been run in the last unit of time
    const now:Date = new Date();
    const startOfTimeUnit:Date = new Date(now.getTime() - this.unitOfTimeMillis);
    const promisesFinishedInLastUnitTime:Array<Date> = this.promiseCompletedTimesLog.filter(time => {
      return time.getTime() >= startOfTimeUnit.getTime()
    });
    const numberOfPromisesFinishedInLastUnitTime:number = promisesFinishedInLastUnitTime.length;
    const numberOfPromisesBeingExecuted:number = Object.keys(this.promisesBeingExecuted).length;
    const numberOfPromisesLeftInConcurrencyLimit:number = this.maxNumberOfConcurrentPromises - numberOfPromisesBeingExecuted;
    const numberOfPromisesLeftInRateLimit:number = this.maxThroughputPerUnitTime - numberOfPromisesFinishedInLastUnitTime - numberOfPromisesBeingExecuted;
    const numberOfPromisesToStart:number = Math.min(numberOfPromisesLeftInConcurrencyLimit, numberOfPromisesLeftInRateLimit);
    if (numberOfPromisesToStart <= 0) {
      // if we are not starting any more promises, we should check to see if we are going to start more later
      if (!this.reattemptTimeoutId) {
        // given we are in the situation where no more promises are being started, we need to decide how long to wait
        const periodToWaitToReattemptPromisesMillis:number = numberOfPromisesFinishedInLastUnitTime > 0
          ? now.getTime() - promisesFinishedInLastUnitTime[0].getTime()
          : this.unitOfTimeMillis;
        this.reattemptTimeoutId = setTimeout(() => {
          this.reattemptTimeoutId = null;
          this.execute();
        }, periodToWaitToReattemptPromisesMillis);
      }

      return;
    }
    // if we can run more promises, run more promises until we hit the max or run out of promises
    for (let count:number = 0; count < numberOfPromisesToStart; count++) {
      const nextPromiseToStart:QueuedPromise<any>|undefined = this.promisesToExecute.shift();
      if (!nextPromiseToStart) {
        return;
      }
      const id = nextPromiseToStart.id;
      const promiseExecutionListener = this.promiseExecutedCallbacks[id];
      if (!promiseExecutionListener) {
        continue;
      }

      // run the promise and pass the result back to the callback associated with this promise
      const newlyStartedPromise = nextPromiseToStart.promiseSupplier()

      this.promisesBeingExecuted[id] = {
        id,
        promiseSupplier: nextPromiseToStart.promiseSupplier,
        promise: newlyStartedPromise,
        dependencies: nextPromiseToStart.dependencies,
        result: null,
        listener: promiseExecutionListener,
      }

      newlyStartedPromise
        .then(res => {
          return {
            isSuccess: true,
            result: res,
            error: null,
          }
        })
        .catch(err => {
          return {
            isSuccess: false,
            result: null,
            error: err,
          }
        })
        .then((res:FinishedPromiseResult<any>) => {

          // get the current state of the resolved promise
          const thisPromise = this.promisesBeingExecuted[id]
          thisPromise.result = res;

          // this promise has been executed, so remove it from the callbacks and currently executing promises
          // they are removed from executing promises before they are resolved to allow more work to be done even if their final resolution has not done yet
          delete this.promiseExecutedCallbacks[id];
          delete this.promisesBeingExecuted[id];
          this.promisesWaitingToResolve[id] = thisPromise;
          this.onPromiseFinished(id)


        })
        .finally(() => {

          // eslint-disable-next-line no-shadow
          const now:Date = new Date();
          // eslint-disable-next-line no-shadow
          const startOfTimeUnit:Date = new Date(now.getTime() - this.unitOfTimeMillis);
          this.promiseCompletedTimesLog.push(now);
          this.promiseCompletedTimesLog = this.promiseCompletedTimesLog.filter(time => {
            return time.getTime() >= startOfTimeUnit.getTime()
          });
          this.execute();
        });
    }
  }

}