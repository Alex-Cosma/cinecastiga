import type { MemoryFixture } from "./memory-vocabulary";

/**
 * Test vocabulary: real catalogue labels and the real curated synonyms
 * (reference.cpv_synonym, 22 Oct 2026), a handful of real public names. The
 * gazetteer is the full RPL 2021 catalog (every county, UAT and sector).
 */
const SYNONYMS = "brichete=03413000,lemn de foc=03413000,lemne=03413000,peleti=03413000,combustibil=09100000,carbune=09110000,gaz=09123000,gaze naturale=09123000,carburant=09130000,carburanti=09130000,benzina=09132000,motorina=09134000,curent=09310000,electricitate=09310000,energie electrica=09310000,caldura=09320000,energie termica=09320000,incalzire=09320000,panouri solare=09331000,fotovoltaice=09331200,nisip=14211000,balast=14212000,pietris=14212000,alimente=15000000,hrana=15000000,mancare=15000000,carne=15100000,fructe=15300000,legume=15300000,lapte=15500000,paine=15811000,apa minerala=15981000,imbracaminte=18000000,uniforme=18100000,incaltaminte=18800000,cartuse=30125100,toner=30125100,birotica=30190000,papetarie=30190000,hartie=30197630,calculatoare=30200000,computere=30200000,laptopuri=30213100,becuri=31500000,iluminat=31500000,aparatura medicala=33100000,echipamente medicale=33100000,seringi=33141310,manusi=33141420,doctorii=33600000,medicamente=33600000,produse farmaceutice=33600000,dezinfectant=33631600,vaccinuri=33651600,reactivi=33696000,autovehicule=34100000,autoturisme=34110000,masini=34110000,ambulante=34114121,autobuze=34121000,autoutilitare=34130000,masti=35113400,mobila=39100000,mobilier=39100000,apa=41000000,ciment=44111200,beton=44114000,constructii=45000000,lucrari=45000000,cladiri=45210000,scoala=45214000,poduri=45221000,alimentare cu apa=45232150,canalizare=45232400,asfalt=45233000,asfaltare=45233000,drumuri=45233000,sosele=45233000,reabilitare drumuri=45233140,licente=48000000,programe=48000000,software=48000000,intretinere=50000000,mentenanta=50000000,reparatii=50000000,catering=55520000,mese=55520000,transport=60000000,proiectare=71000000,arhitectura=71200000,inginerie=71300000,servicii it=72000000,consultanta=79400000,paza=79710000,securitate=79710000,deseuri=90500000,gunoi=90500000,salubrizare=90500000,curatenie=90910000";

const CATALOG = `03410000-7|Lemn
03413000-8|Lemn de foc
09123000-7|Gaze naturale
15981320-7|Zăpadă
22321000-6|Felicitări de Crăciun
30141200-1|Calculatoare de birou
30200000-1|Echipament informatic şi accesorii
30213100-6|Computere portabile
31500000-1|Echipament de iluminat şi lămpi electrice
31527200-8|Iluminat exterior
31527260-6|Sisteme de iluminat
33600000-6|Produse farmaceutice
33690000-3|Diverse medicamente
34110000-1|Autoturisme
34928400-2|Mobilier urban
34928520-9|Stâlpi de iluminat
34993000-4|Iluminat stradal
39100000-3|Mobilier
39160000-1|Mobilier şcolar
39162110-9|Rechizite şcolare
39298910-9|Pom de Crăciun
41000000-9|Apă colectată şi purificată
41110000-3|Apă potabilă
44113620-7|Asfalt
45000000-7|Lucrări de construcţii
45214000-0|Lucrări de construcţii de clădiri pentru învăţământ şi cercetare
45232400-6|Lucrări de construcţii de canalizare de ape reziduale
45233000-9|Lucrări de construcţii, de fundaţii şi de îmbrăcare a autostrăzilor şi a drumurilor
45233140-2|Lucrări de drumuri
45233222-1|Lucrări de pavare şi de asfaltare
55520000-1|Servicii de catering
55524000-9|Servicii de catering pentru şcoli
60000000-8|Servicii de transport (cu excepţia transportului deşeurilor)
79710000-4|Servicii de securitate
79713000-5|Servicii de pază
79953000-9|Servicii de organizare de festivaluri
90500000-2|Servicii privind deşeurile menajere şi deşeurile
90620000-9|Servicii de deszăpezire
90910000-9|Servicii de curăţenie`;

export const FIXTURE: MemoryFixture = {
  catalog: CATALOG.split("\n").map((line) => {
    const [code, name] = line.split("|");
    return { code: code!, name: name! };
  }),
  synonyms: SYNONYMS.split(",").map((pair) => {
    const [term, prefix] = pair.split("=");
    return { term: term!, prefix: prefix! };
  }),
  authorities: [
    { id: 2144364, name: "MUNICIPIUL BUZAU", county: "Buzau", total: 1_600_000_000 },
    { id: 2144001, name: "JUDETUL BUZAU", county: "Buzau", total: 900_000_000 },
    { id: 2144002, name: "SPITALUL JUDETEAN DE URGENTA BUZAU", county: "Buzau", total: 700_000_000 },
    { id: 2144003, name: "MUNICIPIUL RIMNICU SARAT", county: "Buzau", total: 300_000_000 },
    { id: 2144004, name: "SCOALA GIMNAZIALA NR. 11 BUZAU", county: "Buzau", total: 2_000_000 },
    { id: 3000001, name: "MUNICIPIUL BRAILA", county: "Braila", total: 1_200_000_000 },
    { id: 3000002, name: "SPITALUL JUDETEAN DE URGENTA BRAILA", county: "Braila", total: 650_000_000 },
    { id: 4000001, name: "COMPANIA NATIONALA DE ADMINISTRARE A INFRASTRUCTURII RUTIERE S.A.", county: "Bucuresti", total: 90_000_000_000 },
    { id: 5000001, name: "COMUNA SALCIOARA", county: "Ialomita", total: 20_000_000 },
  ],
  suppliers: [
    { id: 9000001, name: "CONSTRUCTII ERBASU S.A.", county: "Bucuresti", total: 3_000_000_000 },
    { id: 9000002, name: "S.C. ERBASU EDIL CONSTRUCT S.A.", county: "Bucuresti", total: 200_000_000 },
    { id: 9000003, name: "ELBI ENERGY PROJECTS SRL", county: "Buzau", total: 40_000_000 },
    { id: 9000004, name: "STRABAG SRL", county: "Bucuresti", total: 9_000_000_000 },
    { id: 9000005, name: "ELECTRO ADI TIME SRL", county: "Buzau", total: 3_000_000 },
    { id: 9000006, name: "CRACIUN IMPEX SRL", county: "Cluj", total: 1_000_000 },
    { id: 9000007, name: "SC STRABAG SRL", county: "NA", total: 3_000_000 },
    { id: 9000008, name: "ILUMINAT FESTIV S.R.L.", county: "Ilfov", total: 2_000_000 },
  ],
  persons: [
    { key: "ion popescu|1960-01-01|buzau", name: "POPESCU ION", birthYear: 1960, birthLocality: "Buzău", nFirms: 4 },
    { key: "ion popescu|1975-05-05|iasi", name: "POPESCU ION", birthYear: 1975, birthLocality: "Iași", nFirms: 2 },
    { key: "matei ioan|1957-01-01|batin", name: "MATEI IOAN", birthYear: 1957, birthLocality: "Sat Batin", nFirms: 3 },
  ],
};
