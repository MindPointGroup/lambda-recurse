const ss = require('child_process').execSync
const fs = require('fs')

const AWS = require('aws-sdk')

const config = { region: 'us-east-1' }

if (process.env['PROFILE']) {
  config.credentials = new AWS.SharedIniFileCredentials({
    profile: process.env['PROFILE']
  })
}

const lambda = new AWS.Lambda(config)
const sns = new AWS.SNS(config)
const iam = new AWS.IAM(config)

const api = module.exports = {}

const sr = () => Math.random().toString(16).slice(2)

api.createRole = async () => {
  const policy = {
    Version: '2012-10-17',
    Statement: [{
      Sid: 'LambdaRole',
      Effect: 'Allow',
      Principal: {
        Service: 'lambda.amazonaws.com'
      },
      Action: 'sts:AssumeRole'
    }]
  }

  const params = {
    AssumeRolePolicyDocument: JSON.stringify(policy),
    Path: '/',
    RoleName: 'Lambda-' + sr()
  }

  let data = null

  try {
    data = await iam.createRole(params).promise()
  } catch (err) {
    return { err }
  }

  return { data }
}

api.deleteRole = async ({ name }) => {
  let data = null

  try {
    data = await iam.deleteRole({ name })
  } catch (err) {
    return { err }
  }
  return { data }
}

api.createTopic = async ({ name: Name }) => {
  try {
    const data = await sns.createTopic({ Name }).promise()
    return { data }
  } catch (err) {
    return { err }
  }
}

api.deleteTopic = async ({ arn: TopicArn }) => {
  try {
    const data = await sns.deleteTopic({ TopicArn }).promise()
    return { data }
  } catch (err) {
    return { err }
  }
}

api.existsTopic = async ({ arn: TopicArn }) => {
  try {
    const data = await sns.getTopicAttributes({ TopicArn }).promise()
    return { data: !!data.DisplayName }
  } catch (err) {
    return { err }
  }
}

api.createFunction = async (args) => {
  const {
    filename,
    arn: roleArn
  } = args

  const target = `/tmp/test.zip`

  try {
    ss(`zip -j -r ${target} ${filename}`, { cwd: __dirname })
  } catch (ex) {
    console.log('unable to zip', String(ex.stdout))
    process.exit(1)
  }

  const name = 'test-' + sr()

  const params = {
    FunctionName: name,
    Handler: 'index.handler',
    Timeout: 1,
    Publish: true,
    Runtime: 'nodejs8.10',
    Role: roleArn,
    Code: {
      ZipFile: fs.readFileSync(target)
    }
  }

  let data = null

  try {
    data = await lambda.createFunction(params).promise()
  } catch (err) {
    return { err }
  }

  return { data }
}

api.invokeFunction = async (args) => {
  const {
    name: FunctionName,
    payload: Payload
  } = args

  const params = {
    FunctionName,
    Payload
  }

  let data = null

  try {
    data = await lambda.invoke(params).promise()
  } catch (err) {
    return { err }
  }

  return { data }
}

api.deleteFunction = async (args) => {
  const { name: FunctionName } = args

  const params = {
    FunctionName
  }

  let data = null

  try {
    data = await lambda.deleteFunction(params).promise()
  } catch (err) {
    return { err }
  }

  return { data }
}
