const process = require('process')

const debug = process.env.DEBUG ? s => console.log(s) : () => {}

const die = e => {
  debug(e.message)
  throw e
}

module.exports = (lambda, args) => {
  let {
    context,
    payload,
    validator,
    interval,
    maxRecurse,
    maxTimeLeft
  } = args

  const _ = {}

  payload = payload || {}
  const pl = payload._ || {}

  _.maxTimeLeft = pl.maxTimeLeft || maxTimeLeft || 10000
  _.interval = pl.interval || interval || 1000
  _.maxRecurse = pl.maxRecurse || maxRecurse || 2
  _.recurseAttempt = pl.recurseAttempt || 1

  debug(`Recursion: ${JSON.stringify(_)}`)

  if (!(validator instanceof Function)) {
    die(new Error('validator must be a function'))
  }

  if (typeof (context) !== 'object') {
    die(new Error('lambda context object required'))
  }

  return new Promise((resolve, reject) => {
    let timer

    const runner = async () => {
      try {
        //
        // If the validator function returns a truthy value, we can call the
        // resolve function and finish recursing. If it doesn't, keep trying.
        //
        const copy = Object.assign({}, payload)
        delete copy._ // ensure our meta data is not passed to the validator.
        const data = await validator(copy)

        if (data) {
          resolve(data)
          clearInterval(timer)
          return
        }
      } catch (err) {
        debug(`Validator error: ${err.message}`)
        clearInterval(timer)
        reject(err)
        return
      }

      //
      // Before recursing, check to see if max time has been exceeded.
      // If not exceeded, return and the runner function will execute
      // on the next tick.
      //
      const remaining = context.getRemainingTimeInMillis()
      const outOfTime = remaining < _.maxTimeLeft

      if (!outOfTime) return

      debug('Lambda execution environment out of time')
      clearInterval(timer)

      //
      // If we are out of time and we have reached the max number of
      // times we should recurse, reject!
      //
      if (_.recurseAttempt >= _.maxRecurse) {
        debug('max recursion')
        reject(new Error('Max recursion'))
        return
      }

      const functionName = process.env.AWS_LAMBDA_FUNCTION_NAME || 'test'

      const attempt = parseInt(_.recurseAttempt, 10)
      _.recurseAttempt = attempt + 1

      debug(`Retrying ${functionName} function, ${attempt} attempts`)

      //
      // Recurse and forward the payload and call the lambda function by
      // its name.
      //
      const params = {
        InvocationType: 'Event',
        FunctionName: functionName,
        Payload: JSON.stringify(Object.assign({}, payload, { _ }))
      }

      debug(params)

      try {
        //
        // The value returned in the Payload should be a parsable string.
        //
        const res = await lambda.invoke(params).promise()

        if (res && res.Payload) {
          resolve(JSON.parse(res.Payload))
          return
        }

        reject(new Error('No data'))
      } catch (err) {
        reject(err)
      }
    }

    timer = setInterval(runner, _.interval)
  })
}
