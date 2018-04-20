# lambda-recurse
Make a lambda function recursively invoke itself until a user-defined state is met. Largely inspired by this blog post https://hackernoon.com/write-recursive-aws-lambda-functions-the-right-way-4a4b5ae633b6

## Use Cases

There are several use cases for invoking lambda recursively

* **Long running compute tasks**
  * Example inspiration https://github.com/theburningmonk/lambda-recursive-s3-demo/blob/master/batch-processor.js
* **Eventing the state of AWS resources**
  * Do X thing/function/call when:
    * a launched EC2 instance is both ready and status checks have passed
    * a newly created RDS Database instance is ready
    * an importImage operation is complete

## Installation
`npm install lambda-recurse`

## Usage

This library is meant to be executed within Lambda, it probably wont work on your local workstation. You'll want to be sure to include `lambda-recurse` within your deployment zip file as [described by AWS here](https://docs.aws.amazon.com/lambda/latest/dg/nodejs-create-deployment-pkg.html) or you might find it easier to simply use something like [Serverless Framework](https://serverless.com/).

The following is an example of running a lambda function recursively until an ec2-instance in us-east-1 with the tag pair of `Name: MyEc2Instance` appears when invoking `describeInstances()`

```javascript
const recurse = require('lambda-recurse')
const AWS = require('aws-sdk')
const ec2 = new AWS.EC2({region: 'us-east-1'})

// how long to wait between retries of validator() (in ms)

const interval = 5000 
// max times to recursively call lambda (one-indexed)
const maxRecurse = 2 

// trigger recursion/failure when lamba execution 
// has this much time (in ms) left
const maxTimeLeft = 7000 

exports.handler = (event, context, cb) => {
  let payload = event

  const validator = async () => {
    // Required: Define a function that will be used to determine
    // completion. It should return true or false.
    const data = await ec2.describeInstances({
    	Filters: [{Name: 'tag:Name', Values: ['MyEc2Instance']}]
    }).promise()

    return data.Reservations.length === 1
  }

  const successFn = async () => {
    // Required: A function to run once validator() has returned true
    console.log('Instance Exists')
    cb(null, 'success')
  }
  
  const failFn = async () => {
    // Required: A function to invoke if time has ran out on the last recursion
    // thus constituting a failure
    console.log('failFn hit')
    cb(null, 'failure')
  }

  recurse({context, payload, validator, interval, maxRecurse, successFn, failFn, maxTimeLeft})
}

```
# Recurse Parameters

### **REQUIRED** => context
Pass down the lambda context object as-is from within your handler

### **REQUIRED** => validator
A promisified/async function that returns either `true` or `false`. Use this function to determine completeness ie "is a node available? "did a processing job finish?" "is my DB ready to accept connections"

### **REQUIRED** => successFn
A promisified/async function to execute if `validator()` returns true. For example, if you desire to update a K/V store once an ec2 instance is 'running', you would write that logic here, in `successFn()`

### **REQUIRED** => failFn
A promisified/async function to execute if time has run out on the last recursive call.

### **OPTIONAL (default=2)** => maxRecurse
The maximum amount of times to recursively invoke your lambda function

### **OPTIONAL (default=1000)** => interval
How long to wait before re-invoking `validator()`

### **OPTIONAL (default=10000)** => maxTimeLeft
How long to wait before re-invoking `validator()`

### **OPTIONAL (no default)** => payload
If the core logic of your function depends on a payload pass it through here so that `recurse()` proxies it through to subsequent, recursive, calls.

# Desired Contributions and Roadmap
* Testing (not sure how to best approach this yet)
* Exponential backoff option for `validate()`
* Make this compatible with other serverless providers