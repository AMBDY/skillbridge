const crypto = require('crypto');

function sha256Hex(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}
function hmac(key, data) {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
}

// Signs a request for AWS's Signature Version 4 scheme. Returns the headers
// to send alongside the given body. Implements the algorithm documented at
// https://docs.aws.amazon.com/general/latest/gr/sigv4-signed-request.html
function signAwsRequest({ accessKeyId, secretAccessKey, region, service, host, method, path, body, target }) {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ''); // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.slice(0, 8);

  const payloadHash = sha256Hex(body);
  const canonicalHeaders =
    `content-type:application/x-amz-json-1.1\n` +
    `host:${host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n` +
    `x-amz-target:${target}\n`;
  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date;x-amz-target';

  const canonicalRequest = [method, path, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, sha256Hex(canonicalRequest)].join('\n');

  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, 'aws4_request');
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');

  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    'Content-Type': 'application/x-amz-json-1.1',
    'X-Amz-Date': amzDate,
    'X-Amz-Content-Sha256': payloadHash,
    'X-Amz-Target': target,
    Authorization: authorization
  };
}

module.exports = { signAwsRequest };
