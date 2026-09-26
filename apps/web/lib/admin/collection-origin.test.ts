import {describe,it,expect} from 'vitest';
import {validCollectionOrigin} from './collection-origin';
const request=(origin?:string,site?:string)=>new Request('http://localhost:3000/api/admin/collection',{method:'POST',headers:{...(origin?{Origin:origin}:{}),...(site?{'Sec-Fetch-Site':site}:{})}});
describe('admin control origin behind the production proxy',()=>{
 it('accepts the configured public origin despite an internal request URL',()=>expect(validCollectionOrigin(request('https://cinecastiga.ro','same-origin'),'https://cinecastiga.ro')).toBe(true));
 it('rejects another origin and the internal origin in production',()=>{expect(validCollectionOrigin(request('https://evil.invalid'),'https://cinecastiga.ro')).toBe(false);expect(validCollectionOrigin(request('http://localhost:3000'),'https://cinecastiga.ro')).toBe(false);});
 it('rejects missing and cross-site origin metadata',()=>{expect(validCollectionOrigin(request(),'https://cinecastiga.ro')).toBe(false);expect(validCollectionOrigin(request('https://cinecastiga.ro','cross-site'),'https://cinecastiga.ro')).toBe(false);});
 it('retains the request-origin check for local development',()=>expect(validCollectionOrigin(request('http://localhost:3000'))).toBe(true));
});
