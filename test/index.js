process.env.DEBUG = true

// const AWS = require('aws-sdk')
const recurse = require('..')
const test = require('tape')

const sleep = t => new Promise(resolve => setTimeout(resolve, t))

class Context {
  constructor () {
    this.ms = 2000
  }

  getRemainingTimeInMillis () {
    return (this.ms = this.ms / 2)
  }

  reset () {
    this.ms = 3e4
  }
}

const context = new Context()

class FakeLambda {
  constructor (fn) {
    this.fn = fn
  }

  invoke (args) {
    const {
      InvocationType,
      FunctionName,
      Payload
    } = args

    if (!InvocationType) throw new Error('InvocationType required')
    if (!FunctionName) throw new Error('FunctionName required')
    if (!Payload) throw new Error('Payload required')

    context.reset()

    const promise = async () => {
      await sleep(Math.random() * 5e3) // simulate some latency
      const res = await this.fn(JSON.parse(Payload), context)
      return { Payload: JSON.stringify(res) }
    }

    return { promise }
  }
}

test('failing - max recursion', async t => {
  t.plan(4)

  const fn = async (event, context) => {
    let subject = false

    setTimeout(() => {
      subject = { success: true }
    }, 5000)

    const args = {
      context,
      payload: event,
      validator: () => subject,
      interval: 100,
      maxRecurse: 3,
      maxTimeLeft: 100
    }

    try {
      const data = await recurse(lambda, args)

      //
      // If the data has already been processed by a lambda, it will
      // have a statusCode, in which case we can return it without
      // wrapping it.
      //
      return data.statusCode ? data : {
        statusCode: 200,
        body: data
      }
    } catch (err) {
      if (err.message === 'Max recursion') {
        t.ok(true, 'reached max recusion')
      }

      t.ok(true, 'no data')
    }
  }

  const lambda = new FakeLambda(fn)
  await fn({}, context)
  t.end()
})

test('passing - resolved value', async t => {
  let result = null
  const fn = async (event, context) => {
    let subject = false

    setTimeout(() => {
      subject = { success: true }
    }, 5000)

    const args = {
      context,
      payload: event,
      validator: () => subject,
      interval: 1000,
      maxRecurse: 3,
      maxTimeLeft: 100
    }

    try {
      const data = await recurse(lambda, args)
      if (data.success) result = data
    } catch (err) {
      t.ok(err)
    }
    t.ok(true)
  }

  const lambda = new FakeLambda(fn)
  const expected = { success: true }
  await fn({}, context)

  t.deepEqual(result, expected)
  t.end()
})

test('failing - defaults', async t => {
  const fn = async (event, context) => {
    let subject = false

    setTimeout(() => {
      subject = { success: true }
    }, 5000)

    const args = {
      context,
      payload: event,
      validator: () => subject
    }

    try {
      await recurse(lambda, args)
    } catch (err) {
      t.ok(err, err.message)
    }
  }

  const lambda = new FakeLambda(fn)
  await fn({}, context)
  t.end()
})

test('failing - validator throws, bubbles up and is caught', async t => {
  const fn = async (event, context) => {
    const args = {
      context,
      payload: event,
      validator: () => {
        throw new Error('Quxx')
      }
    }

    try {
      await recurse(lambda, args)
    } catch (err) {
      t.equal(err.message, 'Quxx')
    }
  }

  const lambda = new FakeLambda(fn)
  await fn({}, context)
  t.end()
})
