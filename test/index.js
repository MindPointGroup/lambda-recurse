process.env.DEBUG = true

const aws = require('./aws')
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

test('Failing - Run locally (simulate lambda), incur max recursion.', async t => {
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

test('Passing - Resolved value', async t => {
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

test('Failing - Defaults', async t => {
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

let state = {
  roleArn: null,
  functionName: null
}

test('Passing - create Function and a Role able to run it.', async t => {
  const {
    err: errCreateRole,
    data: dataCreateRole
  } = await aws.createRole()

  t.ok(!errCreateRole, errCreateRole && errCreateRole.message)

  t.comment('wait for the role to become usable')
  await sleep(3e4)

  state.roleArn = dataCreateRole.Role.Arn
  t.end()
})

test('Passing - create and invoke a long running function that eventually creates an sns topic as proof of execution.', async t => {
  const paramsCreateFunction = {
    filename: 'test-fn-pass.js',
    arn: state.roleArn
  }

  const {
    err: errCreateFunction,
    data: dataCreateFunction
  } = await aws.createFunction(paramsCreateFunction)

  t.ok(!errCreateFunction, errCreateFunction && errCreateFunction.message)
  t.ok(dataCreateFunction.FunctionName, 'aws provided confirmation of creating the function')
  t.ok(dataCreateFunction.FunctionName.includes('test-'), 'function was named properly')

  t.comment('wait for the function to become usable')
  await sleep(3e4)

  const {
    err: errCreateTopic,
    data: dataCreateTopic
  } = await aws.createTopic({ name: dataCreateFunction.FunctionName })

  t.ok(!errCreateTopic, 'an sns topic (with the same name as the lambda function) was created')
  t.ok(dataCreateTopic.TopicArn, 'the topic created has an arn')

  //
  // Invoke the function with the arn of the topic. It should get forwarded until the last
  // invocation of the function and then the lambda function should delete the topic.
  //
  const paramsInvokeFunction = {
    name: dataCreateFunction.FunctionName,
    payload: JSON.stringify({ topicArn: dataCreateTopic.TopicArn })
  }

  const {
    err: errInvokeFunction,
    data: dataInvokeFunction
  } = await aws.invokeFunction(paramsInvokeFunction)

  t.ok(!errInvokeFunction, errInvokeFunction && errInvokeFunction.message)
  t.ok(dataInvokeFunction, 'function was invoked')

  t.comment('waiting for 6e4 (ms) for the function to complete')

  //
  // all of this should happen in under 30 seconds because the lambda has a timeout of
  // 0.25 seconds and the maximum level of recursion is set to three.
  //
  await sleep(6e4)

  const {
    err: errTopicExists,
    data: dataTopicExists
  } = await aws.existsTopic({ arn: dataCreateTopic.TopicArn })

  t.ok(!errTopicExists, 'Long running function successfully deleted topic')
  t.ok(!dataTopicExists, 'No topic exists')

  const { err: errDeleteFunction } = await aws.deleteFunction({ name: dataCreateFunction.FunctionName })
  t.ok(!errDeleteFunction, 'the temporary function was successfully deleted')

  t.end()
})

test('failing - create and invoke a long running function who\'s failure eventually creates an sns topic as proof of execution.', async t => {
  const paramsCreateFunction = {
    filename: 'test-fn-fail.js',
    arn: state.roleArn
  }

  const {
    err: errCreateFunction,
    data: dataCreateFunction
  } = await aws.createFunction(paramsCreateFunction)

  t.ok(!errCreateFunction, errCreateFunction && errCreateFunction.message)
  t.ok(dataCreateFunction.FunctionName, 'aws provided confirmation of creating the function')
  t.ok(dataCreateFunction.FunctionName.includes('test-'), 'function was named properly')

  t.comment('wait for the function to become usable')
  await sleep(3e4)

  const {
    err: errCreateTopic,
    data: dataCreateTopic
  } = await aws.createTopic({ name: dataCreateFunction.FunctionName })

  t.ok(!errCreateTopic, 'an sns topic (with the same name as the lambda function) was created')
  t.ok(dataCreateTopic.TopicArn, 'the topic created has an arn')

  //
  // Invoke the function with the arn of the topic. It should get forwarded until the last
  // invocation of the function and then the lambda function should delete the topic.
  //
  const paramsInvokeFunction = {
    name: dataCreateFunction.FunctionName,
    payload: JSON.stringify({ topicArn: dataCreateTopic.TopicArn })
  }

  const {
    err: errInvokeFunction,
    data: dataInvokeFunction
  } = await aws.invokeFunction(paramsInvokeFunction)

  t.ok(!errInvokeFunction, errInvokeFunction && errInvokeFunction.message)
  t.ok(dataInvokeFunction, 'function was invoked')

  t.comment('waiting for 6e4 (ms) for the function to complete')

  //
  // all of this should happen in under 30 seconds because the lambda has a timeout of
  // 0.25 seconds and the maximum level of recursion is set to three.
  //
  await sleep(6e4)

  const {
    err: errTopicExists,
    data: dataTopicExists
  } = await aws.existsTopic({ arn: dataCreateTopic.TopicArn })

  t.ok(!errTopicExists, 'Long running function successfully deleted topic')
  t.ok(!dataTopicExists, 'No topic exists')

  const { err: errDeleteFunction } = await aws.deleteFunction({ name: dataCreateFunction.FunctionName })
  t.ok(!errDeleteFunction, 'the temporary function was successfully deleted')

  t.end()
})

test('Passing - Delete Function and Role.', async t => {
  const { err: errDeleteRole } = await aws.deleteRole({ RoleName: state.roleName })
  t.ok(!errDeleteRole, 'the temporary role was successfully deleted')
  t.end()
})
