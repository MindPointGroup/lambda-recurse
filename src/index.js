const AWS = require('aws-sdk')
const process = require('process')
const lambda = new AWS.Lambda()

module.exports = ({context, payload, validator, interval,
  maxRecurse, successFn, failFn, maxTimeLeft}) => {
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
        .catch((error) => {
          console.error('validator() Error')
          throw error
        })
    if (done) {
      await successFn()
        .catch((error) => {
          console.error('successFn() Error')
          throw error
        })
      clearInterval(timer)
    } else {
      const outOfTime = context.getRemainingTimeInMillis() < maxTimeLeft
      if (outOfTime) {
        console.log('Lambda execution environment out of time')
        if (recurseAttempt >= maxRecurse) {
          console.log('Max recursion level reached, failing...')
          await failFn()
            .catch((error) => {
              console.error(error)
              throw error
            })

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
            .catch((error) => {
              console.log(error)
              throw error
            })
          clearInterval(timer)
        }
      }
    }
  }
  timer = setInterval(runner, interval)
}
