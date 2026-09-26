import { describe, expect, it } from "vitest";
import { monitoringDigestConfig, monitoringDigestPeriod, renderMonitoringDigest } from "./monitoring-digests";

describe("quiet, private monitoring digest content", () => {
  it("requires explicit SMTP and a trusted HTTPS deployment origin for delivery", () => {
    expect(monitoringDigestConfig({}).available).toBe(false);
    const smtp = { SMTP_HOST:"smtp.example.invalid",SMTP_FROM:"alerts@example.invalid" };
    expect(monitoringDigestConfig({ ...smtp,MONITORING_SITE_URL:"https://cinecastiga.example" }).available).toBe(true);
    for (const value of ["http://cinecastiga.example","https://user:password@cinecastiga.example","https://cinecastiga.example/private","https://cinecastiga.example?redirect=evil","https://cinecastiga.example#fragment","not a URL"]) {
      expect(monitoringDigestConfig({ ...smtp,MONITORING_SITE_URL:value }).available).toBe(false);
    }
    const local = monitoringDigestConfig({ ...smtp,BETTER_AUTH_URL:"http://localhost:3110" });
    expect(local.origin).toBe("http://localhost:3110"); expect(local.available).toBe(false);
    expect(monitoringDigestConfig({ ...smtp,SMTP_FROM:"sender@example.invalid\nBcc: other@example.invalid",MONITORING_SITE_URL:"https://cinecastiga.example" }).available).toBe(false);
  });

  it("uses completed UTC days consistently across calendar and DST boundaries", () => {
    expect(monitoringDigestPeriod(undefined,new Date("2026-03-29T06:00:00Z")).period).toBe("2026-03-28");
    expect(monitoringDigestPeriod("2024-02-29",new Date("2026-09-19T06:00:00Z")).end.toISOString()).toBe("2024-03-01T00:00:00.000Z");
    for (const value of ["2026-02-29","2026-13-01","2026-09-19","2026-09-20","2026-9-1",";drop table"]) {
      expect(() => monitoringDigestPeriod(value,new Date("2026-09-19T06:00:00Z"))).toThrow();
    }
  });

  it("escapes user titles, uses private update links and omits source details", () => {
    const result = renderMonitoringDigest({ id:"digest-id",email:"reporter@example.invalid",ownerId:"private-user",period:"2026-09-18",
      updates:[{ id:"run-id",watchId:"watch-id",title:'<script>alert("x")</script> & "quoted"',count:7 }] },
      { origin:"https://cinecastiga.example",from:"alerts@example.invalid" });
    expect(result.html).not.toContain("<script>"); expect(result.html).toContain("&lt;script&gt;");
    expect(result.html).toContain("https://cinecastiga.example/urmariri/watch-id/actualizari/run-id");
    expect(result.text).toContain("autentificare"); expect(result.text).toContain("Preferințe:");
    expect(result.subject).toBe("1 actualizare nouă în urmăririle tale");
    expect(result.messageId).toBe("<monitoring-digest-id@cinecastiga.example>");
    expect(result.html).not.toContain("private-user");
    expect(() => renderMonitoringDigest({ id:"id",email:"e",ownerId:"u",period:"2026-09-18",updates:[] },{ origin:"http://localhost:3110",from:"a" })).toThrow();
  });

  it("keeps long digests short while linking all remaining updates from the inbox", () => {
    const result = renderMonitoringDigest({ id:"id",email:"e",ownerId:"u",period:"2026-09-18",updates:Array.from({ length:25 },(_,i) => ({ id:`r${i}`,watchId:"w",title:"Urmărire",count:0 })) },{ origin:"https://cinecastiga.example",from:"a" });
    expect(result.html.match(/<li>/g)).toHaveLength(20);
    expect(result.text).toContain("Încă 5 actualizări");
    expect(result.html).toContain("Vezi toate actualizările");
  });
});
