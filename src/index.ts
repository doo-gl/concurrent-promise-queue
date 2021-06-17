
import { v4 as uuid } from 'uuid';

export type PromiseSupplier<T> = () => Promise<T>;

type PromiseExecutionListener<T> = (result:FinishedPromiseResult<T>) => void;
interface FinishedPromiseResult<T> {
  isSuccess:boolean,
  result:T|null,
  error:any,
}
interface QueuedPromise<T> {
  id:string,
  promiseSupplier:PromiseSupplier<T>
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
}

export class ConcurrentPromiseQueue<T> {
  private readonly maxNumberOfConcurrentPromises:number;
  private readonly unitOfTimeMillis:number;
  private readonly maxThroughputPerUnitTime:number;
  private promisesToExecute:Array<QueuedPromise<T>>;
  private promisesBeingExecuted:{[id:string]: QueuedPromise<T>};
  private promiseExecutedCallbacks:{[id:string]:PromiseExecutionListener<T>};
  private promiseCompletedTimesLog:Date[];
  private reattemptTimeoutId:number|null;

  constructor(options:QueueOptions) {
    this.maxNumberOfConcurrentPromises = options.maxNumberOfConcurrentPromises || 1000;
    this.unitOfTimeMillis = options.unitOfTimeMillis || 100;
    this.maxThroughputPerUnitTime = options.maxThroughputPerUnitTime || 1000;
    this.promisesToExecute = [];
    this.promisesBeingExecuted = {};
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
  addPromise(promiseSupplier:PromiseSupplier<T>):Promise<T|null> {
    // return a promise that will complete when the promise from the promise supplier has been run.
    return new Promise(((resolve, reject) => {
      // add the promise to list of promises to be executed and also register a callback with the same id
      // so that when this promise has been executed, we can call the callback and resolve the promise to return to the caller
      const id = uuid();
      this.promisesToExecute.push({
        id,
        promiseSupplier,
      });
      this.promiseExecutedCallbacks[id] = (result:FinishedPromiseResult<T>) => {
        if (result.isSuccess) {
          resolve(result.result);
        } else {
          reject(result.error);
        }
      };
      // call execute to kick off the processing of promises if it hasn't already started.
      this.execute();
    }));
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
    const numberOfPromisesLeftInRateLimit:number = this.maxThroughputPerUnitTime - numberOfPromisesFinishedInLastUnitTime;
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
      const nextPromiseToStart:QueuedPromise<T>|undefined = this.promisesToExecute.shift();
      if (!nextPromiseToStart) {
        return;
      }
      const id = nextPromiseToStart.id;
      const promiseExecutionListener = this.promiseExecutedCallbacks[id];
      if (!promiseExecutionListener) {
        continue;
      }
      this.promisesBeingExecuted[id] = nextPromiseToStart;
      // run the promise and pass the result back to the callback associated with this promise
      nextPromiseToStart.promiseSupplier()
        .then(res => {
          delete this.promiseExecutedCallbacks[id];
          delete this.promisesBeingExecuted[id];
          promiseExecutionListener({
            isSuccess: true,
            result: res,
            error: null,
          });
        })
        .catch(err => {
          delete this.promiseExecutedCallbacks[id];
          delete this.promisesBeingExecuted[id];
          promiseExecutionListener({
            isSuccess: false,
            result: null,
            error: err,
          });
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