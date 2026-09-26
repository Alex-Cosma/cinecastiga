/** Streaming, uncompressed ZIP64. Entries and checksums use bounded memory;
 * ZIP64 also keeps a national evidence export valid beyond the 4 GiB boundary. */
export interface ZipEntry { name: string; data: AsyncIterable<Uint8Array> }
const crcTable = Uint32Array.from({length:256},(_,n)=>{
  let c=n;for(let i=0;i<8;i++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;
});
export function crc32(bytes:Uint8Array,previous=0):number {
  let crc=previous^0xffffffff;for(const byte of bytes)crc=crcTable[(crc^byte)&255]!^(crc>>>8);return(crc^0xffffffff)>>>0;
}
export async function* textChunks(value:string):AsyncGenerator<Uint8Array>{yield Buffer.from(value,"utf8");}
export async function* zip64(entries:AsyncIterable<ZipEntry>):AsyncGenerator<Uint8Array>{
  const central:{name:Buffer;offset:bigint;size:bigint;crc:number}[]=[];let position=0n;
  for await(const entry of entries){
    if(!/^[a-zA-Z0-9_./-]+$/.test(entry.name)||entry.name.startsWith("/")||entry.name.split("/").includes(".."))throw new Error("Unsafe ZIP path");
    const name=Buffer.from(entry.name),offset=position;
    const header=Buffer.alloc(30+name.length+20);header.writeUInt32LE(0x04034b50,0);header.writeUInt16LE(45,4);header.writeUInt16LE(0x0808,6);
    header.writeUInt16LE(33,12);header.writeUInt32LE(0xffffffff,18);header.writeUInt32LE(0xffffffff,22);
    header.writeUInt16LE(name.length,26);header.writeUInt16LE(20,28);name.copy(header,30);
    header.writeUInt16LE(1,30+name.length);header.writeUInt16LE(16,32+name.length);
    yield header;position+=BigInt(header.length);let size=0n,crc=0;
    for await(const data of entry.data){crc=crc32(data,crc);size+=BigInt(data.length);position+=BigInt(data.length);yield data;}
    const descriptor=Buffer.alloc(24);descriptor.writeUInt32LE(0x08074b50);descriptor.writeUInt32LE(crc,4);descriptor.writeBigUInt64LE(size,8);descriptor.writeBigUInt64LE(size,16);
    yield descriptor;position+=24n;central.push({name,offset,size,crc});
  }
  const directoryOffset=position;
  for(const entry of central){
    const header=Buffer.alloc(46+entry.name.length+28);header.writeUInt32LE(0x02014b50);header.writeUInt16LE(45,4);header.writeUInt16LE(45,6);header.writeUInt16LE(0x0808,8);
    header.writeUInt16LE(33,14);header.writeUInt32LE(entry.crc,16);header.writeUInt32LE(0xffffffff,20);header.writeUInt32LE(0xffffffff,24);
    header.writeUInt16LE(entry.name.length,28);header.writeUInt16LE(28,30);header.writeUInt32LE(0xffffffff,42);entry.name.copy(header,46);
    const extra=46+entry.name.length;header.writeUInt16LE(1,extra);header.writeUInt16LE(24,extra+2);
    header.writeBigUInt64LE(entry.size,extra+4);header.writeBigUInt64LE(entry.size,extra+12);header.writeBigUInt64LE(entry.offset,extra+20);
    yield header;position+=BigInt(header.length);
  }
  const size=position-directoryOffset,end=Buffer.alloc(56);end.writeUInt32LE(0x06064b50);end.writeBigUInt64LE(44n,4);end.writeUInt16LE(45,12);end.writeUInt16LE(45,14);
  end.writeBigUInt64LE(BigInt(central.length),24);end.writeBigUInt64LE(BigInt(central.length),32);end.writeBigUInt64LE(size,40);end.writeBigUInt64LE(directoryOffset,48);yield end;
  const locator=Buffer.alloc(20);locator.writeUInt32LE(0x07064b50);locator.writeBigUInt64LE(position,8);locator.writeUInt32LE(1,16);yield locator;
  const legacy=Buffer.alloc(22);legacy.writeUInt32LE(0x06054b50);legacy.writeUInt16LE(0xffff,8);legacy.writeUInt16LE(0xffff,10);legacy.writeUInt32LE(0xffffffff,12);legacy.writeUInt32LE(0xffffffff,16);yield legacy;
}
