"""Executable safety regression: private synthetic DB cloned from an EMPTY fixture DB.
Run only after preparing seap_test_identity_import as documented. Never real data.
"""
import hashlib
import json
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
DB='seap_test_identity_script_20261001'
CONTAINER='seap-postgres-1'
class RehearsalSafety(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp=tempfile.TemporaryDirectory(prefix='identity-safety-')
        cls.bundle=Path(cls.temp.name)
        subprocess.run(['docker','exec',CONTAINER,'createdb','-U','seap','-T','seap_test_identity_import',DB],check=True,capture_output=True)
        cls.created=True
        cls.sql('''DO $$ BEGIN IF EXISTS(SELECT 1 FROM core.direct_acquisitions) OR EXISTS(SELECT 1 FROM core.entities) THEN RAISE EXCEPTION 'Fixture template is not empty'; END IF; END $$;
INSERT INTO core.entities(id,name_display,name_normalized,cui_canonical,cui_valid) VALUES
(2146445,'Municipiul Cluj-Napoca','municipiul cluj napoca','4305857',true),
(2147251,'Municipiul Cluj-Napoca','municipiul cluj napoca',NULL,false),
(2165580,'MUNICIPIUL CLUJ-NAPOCA','municipiul cluj napoca','14920794',true);
INSERT INTO core.entity_sicap_ids VALUES(2146445,'authority',1226),(2147251,'authority',4305857),(2165580,'authority',100214502);
INSERT INTO core.direct_acquisitions(id,sicap_da_id,authority_entity_id,closing_value) VALUES
(1,102373033,2147251,9007199254740993.001),(2,102372052,2147251,0.002),(3,100000003,2146445,11.13),(4,100000004,2165580,24.24);
INSERT INTO reference.authority_uat VALUES(2147251,54975,324576),(2146445,54975,324576);''')
        (cls.bundle/'rows.tsv').write_text('102373033\t1\n102372052\t1\n')
        (cls.bundle/'groups.json').write_text(json.dumps([{'id':1,'raw':'4305857 Municipiul Cluj-Napoca','identity':{'kind':'cui','cui':'4305857','sicapIds':[1226],'name':'Municipiul Cluj-Napoca'},'rows':2,'samples':['102373033']}]))
        (cls.bundle/'dimension.json').write_text(json.dumps([{'sicapId':1226,'cui':'4305857','name':'Municipiul Cluj-Napoca'}]))
        manifest={'version':2,'dimensionRows':1,'rows':2,'groups':1,'sources':[{'name':'synthetic-only'}],'files':{name:hashlib.sha256((cls.bundle/name).read_bytes()).hexdigest() for name in ('rows.tsv','groups.json','dimension.json')}}
        (cls.bundle/'manifest.json').write_text(json.dumps(manifest))
    @classmethod
    def sql(cls,query):
        return subprocess.run(['docker','exec','-i',CONTAINER,'psql','-X','-U','seap','-d',DB,'-v','ON_ERROR_STOP=1','-At'],input=query,text=True,check=True,capture_output=True).stdout
    @classmethod
    def tearDownClass(cls):
        if getattr(cls,'created',False):subprocess.run(['docker','exec',CONTAINER,'dropdb','-U','seap',DB],check=True,capture_output=True)
        cls.temp.cleanup()
    def phase(self,name,ok=True):
        result=subprocess.run(['python3',str(ROOT/'scripts/identity-repair/rehearse.py'),'--database',DB,'--bundle',str(self.bundle),'--phase',name],text=True,capture_output=True)
        self.assertEqual(result.returncode==0,ok,result.stdout+result.stderr)
        return result
    def test_repair_guards_and_replay(self):
        original=(self.bundle/'rows.tsv').read_text()
        (self.bundle/'rows.tsv').write_text(original+'0\t1\n')
        self.phase('prepare',False)
        (self.bundle/'rows.tsv').write_text(original)
        self.phase('prepare');self.phase('audit')
        self.sql('UPDATE core.direct_acquisitions SET closing_value=123 WHERE id=1;')
        self.phase('pilot',False)
        self.assertEqual(self.sql('SELECT count(*) FROM identity_repair.applied;').strip(),'0')
        self.sql('UPDATE core.direct_acquisitions SET closing_value=9007199254740993.001 WHERE id=1;UPDATE core.direct_acquisitions SET raw_id=99 WHERE id=2;')
        self.phase('pilot',False)
        self.sql('UPDATE core.direct_acquisitions SET raw_id=NULL WHERE id=2;')
        self.phase('pilot');self.phase('verify');self.phase('apply');self.phase('verify')
        self.assertEqual(self.sql('SELECT count(*) FROM identity_repair.applied;').strip(),'2')
        self.sql('UPDATE core.direct_acquisitions SET authority_entity_id=2146445 WHERE id=4;')
        self.phase('verify',False) # even unrelated authority changes must be detected
        self.sql('UPDATE core.direct_acquisitions SET authority_entity_id=2165580 WHERE id=4;')
        alias_sql=(ROOT/'scripts/identity-repair/aliases.sql').read_text()
        self.sql("INSERT INTO identity_repair.dimension VALUES(4305857,NULL,'A different legitimate participant');")
        self.sql(alias_sql)
        self.assertEqual(self.sql('SELECT count(*) FROM core.entity_redirects;').strip(),'0')
        self.sql('DROP TABLE identity_repair.previous_uat,identity_repair.previous_sicap,identity_repair.alias_plan;DELETE FROM identity_repair.dimension WHERE sicap_id=4305857;')
        self.sql('UPDATE reference.authority_uat SET population=1 WHERE entity_id=2146445;')
        with self.assertRaises(subprocess.CalledProcessError): self.sql(alias_sql)
        self.sql('UPDATE reference.authority_uat SET population=324576 WHERE entity_id=2146445;')
        self.sql(alias_sql)
        self.assertEqual(self.sql('SELECT canonical_id FROM core.entity_redirects WHERE old_id=2147251;').strip(),'2146445')
        self.assertEqual(self.sql("SELECT count(*) FROM core.entity_sicap_ids WHERE namespace='authority' AND sicap_id=4305857;").strip(),'0')
        self.assertEqual(self.sql('SELECT authority_entity_id FROM core.direct_acquisitions WHERE id=4;').strip(),'2165580')
        self.phase('verify')

if __name__=='__main__':unittest.main()
