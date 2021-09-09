import { Handler, DynamoDBStreamEvent } from 'aws-lambda';
import { DocumentClient, UpdateItemOutput } from 'aws-sdk/clients/dynamodb';
import * as redis from 'redis';
import { RedisClient } from 'redis';
import { readFileSync } from 'fs';

export const handler: Handler = async function (event: DynamoDBStreamEvent): Promise <any> {
    console.log(JSON.stringify(event));
    let resultOfOps: object = {};
    if (event.Records[0].eventName === "INSERT") {
        await (new DocumentClient({ 'region': (process.env.DDB_REGION).trim() })).update({
            'TableName': (process.env.DDB_TABLE_NAME).trim(),
            'Key': {
                'table_name': "tannisUsers"
            },
            'UpdateExpression': "set max_sl_no = :sl_no",
            'ConditionExpression': "max_sl_no < :sl_no",
            'ExpressionAttributeValues': {
                ':sl_no': Number(event.Records[0].dynamodb.NewImage.sl_no['N'])
            },
            'ReturnValues': "UPDATED_NEW"
        }).promise().then((dbUpdateOpData: UpdateItemOutput): Promise <any> => {
            console.log(JSON.stringify(dbUpdateOpData)); resultOfOps['dbUpdateOpData'] = dbUpdateOpData;
            return (new Promise ((resolve: any, reject: any): void => {
                let redisClientConn: RedisClient = redis.createClient({
                    'host': (process.env.REDIS_HOST).trim(),
                    'port': Number((process.env.REDIS_PORT).trim()),
                    'connect_timeout': 30000
                });
                redisClientConn.on("connect", (): void => {
                    redisClientConn.eval(
                        (readFileSync('./cacheUpdate.lua', 'utf-8')).replace(/[\n\r]+/g, '\n'),
                        1, 'usr_curr_sl_no',
                        event.Records[0].dynamodb.NewImage.sl_no['N'],
                        (evalErr: Error, res: any): void => {
                            redisClientConn.quit();
                            if (evalErr) { reject(evalErr); }
                            else { resolve(res); }
                        }
                    );
                });
                redisClientConn.on("error", (connErr: Error): void => {
                    redisClientConn.quit();
                    reject(connErr);
                });
                redisClientConn.on("quit", (): void => { console.log("Connection to redis server closed !!"); });
            })); 
        }).then((cacheOpsOpData: any): void => { console.log(cacheOpsOpData); resultOfOps['cacheOpsOpData'] = cacheOpsOpData; })
        .catch((err: Error): void => { console.log(JSON.stringify(err)); resultOfOps['error'] = err; })
        .finally((): void => { console.log("This was a promise !!"); });
    }
    console.log(JSON.stringify(resultOfOps));
    return (resultOfOps);
};