import nodemailer from 'nodemailer';
import {operationalAlertRecipients,pendingOperationalAlerts,recordOperationalAlert,type DbSql} from '@seap/db';

export type SendAlert=(message:{to:string[];subject:string;text:string})=>Promise<void>;

/** SMTP from the same variables as the web app; null when not configured. */
export function smtpSender(env=process.env):SendAlert|null {
 if(!env.SMTP_HOST)return null;
 const transport=nodemailer.createTransport({host:env.SMTP_HOST,port:Number(env.SMTP_PORT??587),secure:env.SMTP_SECURE==='true',
  auth:env.SMTP_USER?{user:env.SMTP_USER,pass:env.SMTP_PASS??''}:undefined,
  // Runs inside the minute scheduler: a slow server must not delay the next claim.
  connectionTimeout:10_000,greetingTimeout:10_000,socketTimeout:20_000});
 const from=env.SMTP_FROM||env.SMTP_USER;
 return async m=>{await transport.sendMail({from,to:from,bcc:m.to,subject:`[cinecâștigă? admin] ${m.subject}`,text:m.text});};
}

/** Records new incidents, then mails every pending one to verified admins.
 * Never throws into the scheduler; output goes to stderr (stdout carries run IDs). */
export async function deliverOperationalAlerts(q:DbSql,send:SendAlert|null,origin:string,log:(m:string)=>void=console.error) {
 try {
  const pending=await pendingOperationalAlerts(q,origin);
  if(!pending.length)return 0;
  if(!send){log(`Operational alerts: ${pending.length} pending, SMTP is not configured`);return 0;}
  const to=await operationalAlertRecipients(q);
  if(!to.length){log(`Operational alerts: ${pending.length} pending, no verified admin recipient`);return 0;}
  let sent=0;
  for(const alert of pending){
   try{
    await send({to,subject:String(alert.subject),text:String(alert.body)});
    await recordOperationalAlert(q,String(alert.key),{recipients:to.length});sent++;
   }catch(error){
    await recordOperationalAlert(q,String(alert.key),{error:error instanceof Error?error.message:String(error)});
    log(`Operational alert ${alert.key} not delivered`);
   }
  }
  return sent;
 } catch(error) {
  log(`Operational alerts unavailable: ${error instanceof Error?error.message:String(error)}`);
  return 0;
 }
}
