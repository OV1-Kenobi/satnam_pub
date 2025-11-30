/**
 * Web NFC API type declarations
 * Provides TypeScript support for the Web NFC API used in capability detection
 */

interface NDEFRecord {
  recordType: string;
  mediaType?: string;
  id?: string;
  data?: BufferSource;
  lang?: string;
  encoding?: string;
  text?: string;
}

interface NDEFMessage {
  records: NDEFRecord[];
}

interface NDEFReadingEvent extends Event {
  serialNumber: string;
  records: NDEFRecord[];
}

interface NDEFReader {
  scan(options?: { signal?: AbortSignal }): Promise<NDEFReadingEvent>;
  write(message: NDEFMessage, options?: { overwrite?: boolean }): Promise<void>;
  makeReadOnly(options?: { overwrite?: boolean }): Promise<void>;
}

interface NDEFWriter {
  write(message: NDEFMessage, options?: { overwrite?: boolean }): Promise<void>;
  makeReadOnly(options?: { overwrite?: boolean }): Promise<void>;
}

declare global {
  interface Window {
    NDEFReader?: new () => NDEFReader;
    NDEFWriter?: new () => NDEFWriter;
  }
}

export {};

