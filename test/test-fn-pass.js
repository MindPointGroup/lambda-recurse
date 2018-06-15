const recurse = require('..')
const AWS = require('aws-sdk')

const config = { region: 'us-east-1' }
const lambda = new AWS.Lambda(config)
const sns = new AWS.SNS(config)

const sleep = t => new Promise(resolve => setTimeout(resolve, t))

module.exports = async (event, context) => {
  const validator = async p => {
    if (event._ && event._.recurseAttempt > 2) {
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
    const data = await recurse(lambda, args)

    if (data && data.success) {
      await sns.deleteTopic({ TopicArn: event.topicArn }).promise()
    }
  } catch (err) {
  }
}
