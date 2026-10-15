import {expect,it} from 'vitest';
import {diskCapacity} from './document-storage';
it('distinguishes used space from filesystem reservations unavailable to the app',()=>{
 expect(diskCapacity({blocks:100,bfree:60,bavail:55,bsize:4096})).toEqual({total:409600,used:163840,available:225280,percent:40});
});
it('does not turn unavailable or invalid capacity into a reassuring zero',()=>{
 expect(diskCapacity({blocks:0,bfree:0,bavail:0,bsize:4096})).toBeNull();
 expect(diskCapacity({blocks:100,bfree:101,bavail:60,bsize:4096})).toBeNull();
});
