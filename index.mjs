// dependencies
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3"

import { Readable } from 'stream';

import util from "util"
import sharp from "sharp"

// get reference to S3 client
const s3 = new S3Client({region: "ap-northeast-1"});

const containsPreview = (key) => {
  // 정규 표현식을 사용하여 "preview"가 포함되어 있는지 확인
  const pattern = /preview/i; // 대소문자 무시
  return pattern.test(key);
}

export const handler = async (event, context, callback) => {
  // Read options from the event parameter.
  console.log("Reading options from event:\n", util.inspect(event, {depth: 5}));
  const srcBucket = event.Records[0].s3.bucket.name;
  // Object key may have spaces or unicode non-ASCII characters.
  const srcKey    = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, " "));
  if(containsPreview(srcKey)) return { body: 'this is recursive'}
  const dstBucket = srcBucket;
  const dstKey    = "preview/resized-" + srcKey.replace(/^original\//, ""); // resize された image の name、もし folder を使ってば、folder の name もつけます。ex) "folder_name" + fileName;

  // Infer the image type from the file suffix.
  const typeMatch = srcKey.match(/\.([^.]*)$/);
  if (!typeMatch) {
    console.log("Could not determine the image type.");
    return;
  }

  // Check that the image type is supported
  const imageType = typeMatch[1].toLowerCase();
  if (imageType != "jpg" && imageType != "png") {
    console.log(`Unsupported image type: ${imageType}`);
    return;
  }

  // srcBucket から、アップロードされた image を読む
  try {
    const params = {
      Bucket: srcBucket,
      Key: srcKey
    };
    var origimage = await s3.send(new GetObjectCommand(params));
    var streamData = origimage.Body;
    
    // Convert stream to buffer to pass to sharp resize function.
    if (streamData instanceof Readable) {
      var content_buffer = Buffer.concat(await streamData.toArray());
      
    } else {
      throw new Error('Unknown object stream type');
    }

  } catch (error) {
    console.log(error);
    return;
  }

  // set thumbnail width. Resize will set the height automatically to maintain aspect ratio.
  const width  = 200;

  // Use the sharp module to resize the image and save in a buffer.
  try {
    var buffer = await sharp(content_buffer).resize(width).toBuffer();
                      
  } catch (error) {
    console.log(error);
    return;
  }

  // また dstBucket, dstKey に指定された経路でアップロードします
  try {
    const destparams = {
      Bucket: dstBucket,
      Key: dstKey,
      Body: buffer,
      ContentType: "image"
    };
    const putResult = await s3.send(new PutObjectCommand(destparams));
  } catch (error) {
    console.log(error);
    return;
  }
                    
  console.log("Successfully resized " + srcBucket + "/" + srcKey +
    " and uploaded to " + dstBucket + "/" + dstKey);
  return {
    statusCode: 200,
    body: JSON.stringify('Hello, Kirari!')
  };
};