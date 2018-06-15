const recurse = require('..')
const AWS = require('aws-sdk')

const config = { region: 'us-east-1' }
const lambda = new AWS.Lambda(config)
const sns = new AWS.SNS(config)

const sleep = t => new Promise(resolve => setTimeout(resolve, t))

module.exports = async (event, context) => {
  const validator = async p => {
    if (event._ && event._.recurseAttempt > 4) {
      //
      // This will never be reached...
      //
      return { success: true }
    }

    //
    // Sleep longer than the interval
    // in order to force an invocation.
    //
    await sleep(3e4)
  }

  const args = {
    context,
    payload: event,
    validator,
    interval: 3e4,
    maxRecurse: 3,
    maxTimeLeft: 100
  }

  try {
    await recurse(lambda, args)
  } catch (err) {
    //
    // The expected outcome is that the meta-data in the forwarded payload
    // shows the total recursion attemps to exceed the maximum allowed.
    //
    if (err.message === 'Max recursion') {
      await sns.deleteTopic({ TopicArn: event.topicArn }).promise()
    }
  }
}
