declare module 'yauzl-promise' {
  import { Readable } from 'stream';

  export interface Entry {
    filename: string;
    compressedSize: number;
    uncompressedSize: number;
    openReadStream(): Promise<Readable>;
  }

  export interface ZipFile {
    entryCount: number;
    close(): Promise<void>;
    [Symbol.asyncIterator](): AsyncIterableIterator<Entry>;
  }

  export function open(path: string): Promise<ZipFile>;
  export function fromBuffer(buffer: Buffer): Promise<ZipFile>;
}
