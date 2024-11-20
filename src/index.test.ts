import {ConcurrentPromiseQueue} from "./index";

interface Ticket {
  ticketNumber:number,
  timestamp:Date,
}

class TicketGenerator {

  ticketNumber:number = 0

  generate():Ticket {
    return {
      ticketNumber: this.ticketNumber++,
      timestamp: new Date(),
    }
  }

}

const sleep = async (millis:number) => {
  return new Promise(resolve => setTimeout(resolve, millis))
}

describe("concurrent promise queue", () => {

  it("Should execute Promises in sequence", async () => {

    const queue = new ConcurrentPromiseQueue({maxNumberOfConcurrentPromises: 1})
    const ticketGenerator = new TicketGenerator()

    const generatePromise = (expectedTicketNumbers:Array<number>) => {
      const start = new Date()
      return async () => {
        await sleep(100)
        const ticket = ticketGenerator.generate()
        const millisSinceStart = ticket.timestamp.getTime() - start.getTime()
        expect(expectedTicketNumbers).toContain(ticket.ticketNumber)
      }
    }

    await Promise.all([
      queue.addPromise(generatePromise([0])),
      queue.addPromise(generatePromise([1])),
      queue.addPromise(generatePromise([2])),
      queue.addPromise(generatePromise([3])),
      queue.addPromise(generatePromise([4])),
    ])

  })

  it("Should execute Promises in pairs", async () => {

    const queue = new ConcurrentPromiseQueue({maxNumberOfConcurrentPromises: 2})
    const ticketGenerator = new TicketGenerator()

    const generatePromise = (expectedTicketNumbers:Array<number>) => {
      const start = new Date()
      return async () => {
        await sleep(100)
        const ticket = ticketGenerator.generate()
        const millisSinceStart = ticket.timestamp.getTime() - start.getTime()
        expect(expectedTicketNumbers).toContain(ticket.ticketNumber)
      }
    }

    await Promise.all([
      queue.addPromise(generatePromise([0, 1])),
      queue.addPromise(generatePromise([0, 1])),

      queue.addPromise(generatePromise([2, 3])),
      queue.addPromise(generatePromise([2, 3])),

      queue.addPromise(generatePromise([4, 5])),
      queue.addPromise(generatePromise([4, 5])),
    ])

  })

  it("Should execute Promises in triplets", async () => {

    const queue = new ConcurrentPromiseQueue({maxNumberOfConcurrentPromises: 3})
    const ticketGenerator = new TicketGenerator()

    const generatePromise = (expectedTicketNumbers:Array<number>) => {
      const start = new Date()
      return async () => {
        await sleep(100)
        const ticket = ticketGenerator.generate()
        const millisSinceStart = ticket.timestamp.getTime() - start.getTime()
        expect(expectedTicketNumbers).toContain(ticket.ticketNumber)
      }
    }

    await Promise.all([
      queue.addPromise(generatePromise([0, 1, 2])),
      queue.addPromise(generatePromise([0, 1, 2])),
      queue.addPromise(generatePromise([0, 1, 2])),

      queue.addPromise(generatePromise([3, 4, 5])),
      queue.addPromise(generatePromise([3, 4, 5])),
      queue.addPromise(generatePromise([3, 4, 5])),

      queue.addPromise(generatePromise([6, 7, 8])),
      queue.addPromise(generatePromise([6, 7, 8])),
      queue.addPromise(generatePromise([6, 7, 8])),
    ])

  })

  it("Should execute Promises at max 1 per 500ms", async () => {

    const queue = new ConcurrentPromiseQueue({
      unitOfTimeMillis: 500,
      maxThroughputPerUnitTime: 1,
    })
    const ticketGenerator = new TicketGenerator()

    const generatePromise = () => {
      const start = new Date()
      return async () => {
        await sleep(100)
        const ticket = ticketGenerator.generate()
        const millisSinceStart = ticket.timestamp.getTime() - start.getTime()
        return millisSinceStart
      }
    }

    const millisRunAt:Array<number|null> = await Promise.all([
      queue.addPromise(generatePromise()),
      queue.addPromise(generatePromise()),
      queue.addPromise(generatePromise()),
      queue.addPromise(generatePromise()),
    ])

    if (millisRunAt.some(milli => milli === null)) {
      fail(`Some millis were null: ${millisRunAt.join(", ")}`)
    }

    const milli1 = <number>millisRunAt[0]
    const milli2 = <number>millisRunAt[1]
    const milli3 = <number>millisRunAt[2]
    const milli4 = <number>millisRunAt[3]

    const milliDiff1 = milli2 - milli1
    const milliDiff2 = milli3 - milli2
    const milliDiff3 = milli4 - milli3

    expect(milliDiff1).toBeGreaterThan(500)
    expect(milliDiff2).toBeGreaterThan(500)
    expect(milliDiff3).toBeGreaterThan(500)
  })

  it("Should execute Promises at max 2 per 1000ms", async () => {

    const queue = new ConcurrentPromiseQueue({
      unitOfTimeMillis: 1000,
      maxThroughputPerUnitTime: 2,
    })
    const ticketGenerator = new TicketGenerator()

    const generatePromise = () => {
      const start = new Date()
      return async () => {
        await sleep(100)
        const ticket = ticketGenerator.generate()
        const millisSinceStart = ticket.timestamp.getTime() - start.getTime()
        return millisSinceStart
      }
    }

    const millisRunAt:Array<number|null> = await Promise.all([
      queue.addPromise(generatePromise()),
      queue.addPromise(generatePromise()),
      queue.addPromise(generatePromise()),
      queue.addPromise(generatePromise()),
      queue.addPromise(generatePromise()),
      queue.addPromise(generatePromise()),
    ])

    if (millisRunAt.some(milli => milli === null)) {
      fail(`Some millis were null: ${millisRunAt.join(", ")}`)
    }

    const milli1 = <number>millisRunAt[0]
    const milli2 = <number>millisRunAt[1]
    const milli3 = <number>millisRunAt[2]
    const milli4 = <number>millisRunAt[3]
    const milli5 = <number>millisRunAt[4]
    const milli6 = <number>millisRunAt[5]

    expect(milli3 - milli1).toBeGreaterThan(1000)
    expect(milli4 - milli1).toBeGreaterThan(1000)
    expect(milli5 - milli3).toBeGreaterThan(1000)
    expect(milli6 - milli3).toBeGreaterThan(1000)
  })

   it("Should resolve promises in resolution order by default", async () => {

     const queue = new ConcurrentPromiseQueue({
       maxNumberOfConcurrentPromises: 2,
     })
     const ticketGenerator = new TicketGenerator()

      const generatedTickets = new Array<Ticket>()

     const generatePromise = (sleepTimeMillis:number) => {
       const ticket = ticketGenerator.generate();
       return async () => {
         await sleep(sleepTimeMillis)
         return ticket
       }
     }

     await Promise.all([
       queue.addPromise(generatePromise(1000)).then(ticket => generatedTickets.push(ticket)),
       queue.addPromise(generatePromise(100)).then(ticket => generatedTickets.push(ticket)),
       queue.addPromise(generatePromise(100)).then(ticket => generatedTickets.push(ticket)),
       queue.addPromise(generatePromise(100)).then(ticket => generatedTickets.push(ticket)),
       queue.addPromise(generatePromise(100)).then(ticket => generatedTickets.push(ticket)),
     ])

     expect(generatedTickets.map(ti => ti.ticketNumber)).toEqual([1,2,3,4,0])

   });

  it("Should resolve in queue order if resolveInOrder is set", async () => {

    const queue = new ConcurrentPromiseQueue({
      maxNumberOfConcurrentPromises: 2,
      resolveInOrder: true,
    })
    const ticketGenerator = new TicketGenerator()

    const generatedTickets = new Array<Ticket>()

    const generatePromise = (sleepTimeMillis:number) => {
      const ticket = ticketGenerator.generate();
      return async () => {
        await sleep(sleepTimeMillis)
        return ticket
      }
    }

    await Promise.all([
      queue.addPromise(generatePromise(1000)).then(ticket => generatedTickets.push(ticket)),
      queue.addPromise(generatePromise(100)).then(ticket => generatedTickets.push(ticket)),
      queue.addPromise(generatePromise(100)).then(ticket => generatedTickets.push(ticket)),
      queue.addPromise(generatePromise(1000)).then(ticket => generatedTickets.push(ticket)),
      queue.addPromise(generatePromise(100)).then(ticket => generatedTickets.push(ticket)),
      queue.addPromise(generatePromise(100)).then(ticket => generatedTickets.push(ticket)),
    ])

    expect(generatedTickets.map(ti => ti.ticketNumber)).toEqual([0,1,2,3,4,5])

  })

  it("resolveInOrder should not effect single concurrency execution", async () => {

    const queue = new ConcurrentPromiseQueue({
      maxNumberOfConcurrentPromises: 1,
      resolveInOrder: true,
    })
    const ticketGenerator = new TicketGenerator()

    const generatedTickets = new Array<Ticket>()

    const generatePromise = (sleepTimeMillis:number) => {
      const ticket = ticketGenerator.generate();
      return async () => {
        await sleep(sleepTimeMillis)
        return ticket
      }
    }

    await Promise.all([
      queue.addPromise(generatePromise(1000)).then(ticket => generatedTickets.push(ticket)),
      queue.addPromise(generatePromise(100)).then(ticket => generatedTickets.push(ticket)),
      queue.addPromise(generatePromise(100)).then(ticket => generatedTickets.push(ticket)),
      queue.addPromise(generatePromise(1000)).then(ticket => generatedTickets.push(ticket)),
      queue.addPromise(generatePromise(100)).then(ticket => generatedTickets.push(ticket)),
      queue.addPromise(generatePromise(100)).then(ticket => generatedTickets.push(ticket)),
    ])

    expect(generatedTickets.map(ti => ti.ticketNumber)).toEqual([0,1,2,3,4,5])

  })

})