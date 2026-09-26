import { describe,it,expect } from "vitest";
import { mkdtemp,writeFile,rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { validateCaptureRequest,freezeRow,contractSnapshot } from "./evidence-capture-input";
import { patternBinding,sameRadiografiePattern } from "./radiografie-evidence";
import { csvCell } from "./evidence-bundle";
import { crc32,zip64,textChunks } from "./evidence-zip";
import type { DrillRow } from "./ask/compile";
const row={daCode:"DA1",date:"2025-01-01",authorityId:"1",authority:"A",supplierId:"2",supplier:"S",county:"B",cpvCode:"45000000",cpvName:"Test",value:0.01,valueExact:"0.010000000000000001",src:"da",refId:"123",caNoticeId:null,tedPubnum:null,state:"Oferta acceptata",nWinners:null,contractValueFull:null,valueSuspect:false,estimatedValueRon:null} satisfies DrillRow;
describe("frozen evidence trust boundary",()=>{
  it("ignores forged money/results and preserves full population plus selected list scope",()=>{
    const spec={block:"stat",measure:"value",filters:{yearFrom:2025,yearTo:2025},population:{operator:"and",groups:[{operator:"or",conditions:[{field:"cpv",op:"in",values:["77310000"]}]}]}};
    const result=validateCaptureRequest("query",null,spec,{headline:"999 billion",valueRon:999,result:{value:999},evidenceScope:{cpvPrefixes:["77310000"]},evidenceOptions:{search:"  grădină  ",stream:"da",state:"Oferta acceptata"}});
    expect(result).toEqual({kind:"query",refId:null,spec,options:{scope:{cpvPrefixes:["77310000"]},search:"grădină",stream:"da",state:"Oferta acceptata"}});
    expect(validateCaptureRequest("query",null,spec,{evidenceScope:{entityIds:["1);drop table x"]}})).toHaveProperty("error");
  });
  it("keeps exact amounts and explicit missing values rather than treating missing as zero",()=>{
    expect(freezeRow(row).valueExact).toBe("0.010000000000000001");
    expect(freezeRow({...row,originalValueExact:null} as DrillRow).valueExact).toBeNull();
    expect(freezeRow(row,null).valueExact).toBeNull();
    expect(freezeRow(row).sourceUrl).toBe("https://e-licitatie.ro/pub/direct-acquisition/view/123");
  });
  it("keeps the complete consortium amount separate from every supplier share",()=>{
    const snapshot=contractSnapshot("100.01","RON",[{...row,src:"contracts",valueExact:"50.005",contractValueFull:"100.01",nWinners:2},{...row,supplierId:"3",supplier:"T",src:"contracts",valueExact:"50.005",contractValueFull:"100.01",nWinners:2}],"Contract");
    expect(snapshot.valueRon).toBe("100.01");expect(snapshot.suppliers.map(s=>s.shareExact)).toEqual(["50.005","50.005"]);
    expect(contractSnapshot("100.01","EUR",[],null).valueRon).toBeNull();
  });
  it("uses a canonical server descriptor and ignores a client-supplied binding",()=>{
    const original={kind:"consortiu",cpv_class:"4500",member_ids:["12","13"],notices:["CAN2","CAN1"]};
    const binding=patternBinding("1",original);
    expect(sameRadiografiePattern(binding,patternBinding("1",{...original,member_ids:["13","12","12"],notices:["CAN1","CAN2"]}))).toBe(true);
    for(const changed of [{kind:"rotatie"},{cpv_class:"4800"},{member_ids:["12"]},{notices:["CAN3"]}])expect(sameRadiografiePattern(binding,patternBinding("1",{...original,...changed}))).toBe(false);
    expect(sameRadiografiePattern(binding,patternBinding("2",original))).toBe(false);
    const request=validateCaptureRequest("radiografie","1",{type:"pattern",patternId:"123",sourceBinding:binding},{sourceBinding:binding});
    expect(request).toEqual({kind:"radiografie",refId:"1",spec:{type:"pattern",patternId:"123"},options:{}});
  });
  it("validates source identifiers and protects spreadsheet formulas without rounding decimal fields",()=>{
    expect(validateCaptureRequest("da","-1",null,null)).toHaveProperty("error");
    expect(csvCell("=SUM(A1:A2)")).toBe('"\'=SUM(A1:A2)"');
    expect(csvCell("123456789012345.000001",true)).toBe('"123456789012345.000001"');
    expect(csvCell(null,true)).toBe('""');
  });
});
it("streams a standards-readable ZIP64 with correct CRC and UTF-8 data",async()=>{
  expect(crc32(Buffer.from("123456789"))).toBe(0xcbf43926);
  const directory=await mkdtemp(join(tmpdir(),"seap-zip-test-"));
  try{
    const entries=async function*(){yield{name:"README.md",data:textChunks("Dovezi înghețate\n")};yield{name:"rows.csv",data:textChunks('"0.010000000000000001"\r\n')};};
    const chunks=[];for await(const chunk of zip64(entries()))chunks.push(chunk);
    const path=join(directory,"evidence.zip");await writeFile(path,Buffer.concat(chunks));
    const output=execFileSync("python3",["-c","import zipfile,sys,json; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; print(json.dumps({n:z.read(n).decode() for n in z.namelist()}))",path],{encoding:"utf8"});
    expect(JSON.parse(output)).toEqual({"README.md":"Dovezi înghețate\n","rows.csv":'"0.010000000000000001"\r\n'});
    const unsafe=async function*(){yield{name:"../escape",data:textChunks("no")};};
    await expect((async()=>{for await(const _ of zip64(unsafe())){}})()).rejects.toThrow("Unsafe ZIP path");
  }finally{await rm(directory,{recursive:true,force:true});}
});
