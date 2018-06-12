process.env.DEBUG = true

// const AWS = require('aws-sdk')
const recurse = require('..')
const test = require('tape')

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

    const fn = this.fn

    function promise () {
      return new Promise(resolve => setTimeout(async () => {
        const params = [JSON.parse(Payload), context]
        const res = await fn(...params)
        resolve({ Payload: JSON.stringify(res) })
      }, 1))
    }

    return { promise }
  }
}

test('max recursion', async t => {
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
      return {
        statusCode: 500,
        body: err.message
      }
    }
  }

  const lambda = new FakeLambda(fn)
  const expected = { statusCode: 500, body: 'Max recursion' }
  t.deepEqual(await fn({}, context), expected)
  t.end()
})

test('resolved value', async t => {
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

      return data.statusCode ? data : {
        statusCode: 200,
        body: data
      }
    } catch (err) {
      return {
        statusCode: 500,
        body: err.message
      }
    }
  }

  const lambda = new FakeLambda(fn)
  const expected = { statusCode: 200, body: { success: true } }
  t.deepEqual(await fn({}, context), expected)
  t.end()
})
