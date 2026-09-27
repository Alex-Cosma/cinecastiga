import {getProcessingFreshness} from '@/lib/processing-freshness';
const date=(value:string)=>new Date(value).toLocaleString('ro-RO',{day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Bucharest'});
export default async function RiskFreshness(){
 const freshness=await getProcessingFreshness();
 if(!freshness?.riskAt)return null;
 return <p className="note">Semnale recalculate la <time dateTime={freshness.riskAt}>{date(freshness.riskAt)}</time>. Recalculare săptămânală; datele și statisticile se actualizează separat.</p>;
}
