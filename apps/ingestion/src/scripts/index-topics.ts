import {createDb} from '@seap/db';
import {indexTopics} from '../search/index-topics.js';
const {sql}=createDb();
try {await indexTopics(sql,console.log);} finally {await sql.end();}
