import { DynamoDBStreamEvent } from 'aws-lambda';
import { DocumentClient, UpdateItemOutput } from 'aws-sdk/clients/dynamodb';
import * as redis from 'redis';
import { RedisClient } from 'redis';
import { readFileSync } from 'fs';

export const handler = async function (event: DynamoDBStreamEvent): Promise <any> {
    let resultOfOps: object = {};
    await (new DocumentClient({'region': "ap-south-1"})).update({
        'TableName': "tannisMaxSlNos",
        'Key': {
            'table_name': { "S": "tannisUsers" }
        },
        'UpdateExpression': "set max_sl_no = :sl_no",
        'ConditionExpression': "max_sl_no < :sl_no",
        'ExpressionAttributeValues': {
            ':sl_no': { 'N': event.Records[0].dynamodb.NewImage.sl_no['N'] }
        },
        'ReturnValues': "UPDATED_NEW"
    }).promise().then((dbUpdateOpData: UpdateItemOutput): Promise<any> => {
        console.log(dbUpdateOpData); resultOfOps['dbUpdateOpData'] = dbUpdateOpData;
        return (new Promise ((resolve: any, reject: any): void => {
            let redisClientConn: RedisClient = redis.createClient({
                'host': "tannis-redis-cache.hurzbt.0001.aps1.cache.amazonaws.com",
                'port': 6379,
                'connect_timeout': 30000
            });
            redisClientConn.on("connect", (): void => {
                redisClientConn.eval(
                    readFileSync('./cacheUpdate.lua', 'utf-8'),
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
    .catch((err: Error): void => { console.log(err); resultOfOps['error'] = err; })
    .finally((): void => { console.log("Promise resolved !!"); });
    return (resultOfOps);
};