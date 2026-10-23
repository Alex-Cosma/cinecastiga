import {getProcessingFreshness} from '@/lib/processing-freshness';
import Term from './Term';
const date=(value:string)=>new Date(value).toLocaleString('ro-RO',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Bucharest'});
export default async function RiskFreshness(){
 const freshness=await getProcessingFreshness();
 if(!freshness?.riskAt)return null;
 return <p className="note">Recalculate la <time dateTime={freshness.riskAt}>{date(freshness.riskAt)}</time> · săptămânal <Term id="recalculare-semnale" tip /></p>;
}
