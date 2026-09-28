import {createDb} from '@seap/db';
import {indexTopics} from '../search/index-topics.js';
const {sql}=createDb();
try {
  const existing = process.argv.includes('--if-missing')
    ? await sql`select records from marts.topic_search_state where id=1`
    : [];
  if (existing.length) console.log('Title search is already prepared; keeping the published index.');
  else await indexTopics(sql,console.log);
} finally {await sql.end();}
