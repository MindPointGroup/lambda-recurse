# SYNOPSIS
Make a lambda function recursively invoke itself until a user-defined state is
met. Largely inspired by [this][0] blog post.

## MOTIVATION
There are several use cases for invoking lambda recursively

* **Long running compute tasks**
  * Example [inspiration][1]
* **Eventing the state of AWS resources**
  * Do X thing/function/call when:
    * a launched EC2 instance is both ready and status checks have passed
    * a newly created RDS Database instance is ready
    * an importImage operation is complete

## INSTALL
`npm install lambda-recurse`

## USAGE
You need to make sure that your lambda function at **least** has permissions to
invoke itself.

A simple policy to allow for cloudwatch logs and to self invoke would look like

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "VisualEditor0",
            "Effect": "Allow",
            "Action": [
                "logs:CreateLogStream",
                "lambda:InvokeFunction",
                "lambda:InvokeAsync",
                "logs:PutLogEvents"
            ],
            "Resource": [
                "arn:aws:lambda:us-east-1:1234567890:function:myFunction",
                "arn:aws:logs:*:*:*"
            ]
        },
        {
            "Sid": "VisualEditor1",
            "Effect": "Allow",
            "Action": [
                "cloudwatch:GetMetricStatistics",
                "cloudwatch:Describe*",
                "cloudwatch:ListMetrics"
            ],
            "Resource": "*"
        },
        {
            "Sid": "VisualEditor2",
            "Effect": "Allow",
            "Action": "logs:CreateLogGroup",
            "Resource": "arn:aws:logs:*:*:*"
        }
    ]
}
```

This library is meant to be executed within Lambda, it probably wont work on
your local workstation. You'll want to be sure to include `lambda-recurse`
within your deployment zip file as [described by AWS here][2] or you might
find it easier to simply use something like [Serverless Framework][3].

The following is an example of running a lambda function recursively until an
ec2-instance in us-east-1 with the tag pair of `Name: MyEc2Instance` appears
when invoking `describeInstances()`.

```js
const recurse = require('lambda-recurse')
const AWS = require('aws-sdk')
const ec2 = new AWS.EC2({ region: 'us-east-1' })
const lambda = new AWS.Lambda({ region: 'us-east-1' })

exports.handler = (event, context, cb) => {
  let payload = event
  
  const interval = 5000 // time to wait between retries of validator()
  const maxRecurse = 2 // max times to recursively call lambda (one-indexed)
  const maxTimeLeft = 7000 // trigger recursion after this much time

  const validator = async (payload) => {
    //
    // Required: Define a function that will be used to determine
    // completion. It should return true or false.
    //
    const params = {
    	Filters: [{ Name: 'tag:Name', Values: ['MyEc2Instance'] }]
    }

    const data = await ec2.describeInstances(params).promise()

    return data.Reservations.length === 1
  }

  try {
    const params = {
      context,
      validator,
      interval,
      maxRecurse,
      maxTimeLeft
    }

    const data = recurse(lambda, params)
    // ...do something with your data
  } catch (err) {
    // ...handle your error
  }
}
```

How long this will run will depend on a few factors:
- The timeout you have set on the particular function ([5 minutes max][4])
- The value of `maxRecurse` => Maximum desired recursions
- The value of `maxTimeLeft`

As a function it can be expressed as...

```
  maxRecurse * LambdaTimeout - (maxTimeLeft * maxRecurse) = ApproximateTotalDuration
```

Where **LambdaTimeout**, **maxTimeLeft**, and **ApproximateTotalDuration** are
milliseconds.

## PARAMATERS

### **REQUIRED** `context`
Pass down the lambda context object as-is from within your handler

### **REQUIRED** `validator`
An `async` function that returns either `true` or `false`. Use this function to
determine completeness ie "is a node available? "did a processing job finish?",
"is my DB ready to accept connections".

### **OPTIONAL** `maxRecurse (2)`
The maximum amount of times to recursively invoke your lambda function

### **OPTIONAL** `interval (1000)`
How long to wait before re-invoking `validator()`

### **OPTIONAL** `maxTimeLeft (10000)`
When there is `maxTimeLeft` left before the lambda function hits its timeout or
trigger the next recursive call.

### **OPTIONAL** `payload`
If the core logic of your function depends on a payload pass it through here so
that `recurse()` proxies it through to subsequent, recursive, calls.

# ROADMAP
- Testing (not sure how to best approach this yet)
- Exponential backoff option for `validate()`
- Make this compatible with other serverless providers

[0]:https://hackernoon.com/write-recursive-aws-lambda-functions-the-right-way-4a4b5ae633b6
[1]:https://github.com/theburningmonk/lambda-recursive-s3-demo/blob/master/batch-processor.js
[2]:https://docs.aws.amazon.com/lambda/latest/dg/nodejs-create-deployment-pkg.html
[3]:https://serverless.com/
[4]:https://docs.aws.amazon.com/lambda/latest/dg/limits.html
