const AWS = require('aws-sdk')
const process = require('process')
const lambda = new AWS.Lambda()

module.exports = ({context, payload, validator, interval,
  maxRecurse, successFn, failFn, maxTimeLeft}) => {
  try {
    let recursePayload = payload || { recurseAttempt: 1 }
    if (!recursePayload.recurseAttempt) recursePayload.recurseAttempt = 1

    const recurseAttempt = recursePayload.recurseAttempt
    console.log(`Recursion: ${recurseAttempt}`)
    maxTimeLeft = maxTimeLeft || 10000
    interval = interval || 1000
    maxRecurse = maxRecurse || 2
    if (!(validator instanceof Function)) throw new Error('validator must be a function')
    if (!(successFn instanceof Function)) throw new Error('successFn must be a function')
    if (!(failFn instanceof Function)) throw new Error('failFn must be a function')
    if (typeof (interval) !== 'number') throw new Error('interval must be a number')
    if (typeof (maxRecurse) !== 'number') throw new Error('maxRecurse must be a number')
    if (typeof (maxTimeLeft) !== 'number') throw new Error('maxRecurse must be a number')

    let timer
    const runner = async () => {
      const done = await validator()
      if (done) {
        await successFn()
        clearInterval(timer)
      } else {
        const outOfTime = context.getRemainingTimeInMillis() < maxTimeLeft
        if (outOfTime) {
          console.log('Lambda execution environment out of time')
          if (recurseAttempt >= maxRecurse) {
            console.log('Max recursion level reached, failing...')
            clearInterval(timer)
          } else {
            console.log(`Retrying this lambda function: ${process.env.AWS_LAMBDA_FUNCTION_NAME}`)
            recursePayload['recurseAttempt'] = Number(recurseAttempt) + 1
            const params = {
              InvocationType: 'Event',
              FunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME,
              Payload: recursePayload ? JSON.stringify(payload) : undefined
            }
            await lambda.invoke(params).promise()
            clearInterval(timer)
          }
        }
      }
    }
    console.log('lambda-recurse: running timer()')
    timer = setInterval(runner, interval)
  } catch (err) {
    console.error('lambda-recurse err: ', err)
    throw err
  }
}
