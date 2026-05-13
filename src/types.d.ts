// Minimal ambient declarations for Node.js globals used in this project.
// Replace with @types/node once network is available: npm i -D @types/node

declare const process: {
  argv: string[];
  env: Record<string, string | undefined>;
  exit(code?: number): never;
  cwd(): string;
  stdin: object;
  stdout: object;
  stderr: { write(data: string): void };
};

declare class Buffer {
  static from(data: string, encoding?: string): Buffer;
  static from(data: ArrayBuffer | Uint8Array): Buffer;
  static concat(list: Buffer[]): Buffer;
  toString(encoding?: string): string;
  length: number;
  [index: number]: number;
}

declare module 'node:fs' {
  function readFileSync(path: string, encoding: 'utf8'): string;
  function writeFileSync(path: string, data: string): void;
  function writeFileSync(path: string, data: Buffer): void;
  function mkdirSync(path: string, options?: { recursive?: boolean; mode?: number }): void;
  function chmodSync(path: string, mode: number): void;
  function unlinkSync(path: string): void;
  function existsSync(path: string): boolean;
  function openSync(path: string, flags: string): number;
  function closeSync(fd: number): void;
  interface Stats { mtimeMs: number; }
  function statSync(path: string): Stats;
}

declare module 'node:readline' {
  interface Interface {
    question(query: string, callback: (answer: string) => void): void;
    close(): void;
  }
  interface CreateInterfaceOptions {
    input: object;
    output?: object;
  }
  function createInterface(options: CreateInterfaceOptions): Interface;
}

declare module 'node:os' {
  function tmpdir(): string;
  function hostname(): string;
  function userInfo(): { username: string };
}

declare module 'node:path' {
  function join(...paths: string[]): string;
}

declare module 'node:crypto' {
  interface Cipher {
    update(data: Buffer): Buffer;
    update(data: string, inputEncoding: string): Buffer;
    final(): Buffer;
    getAuthTag(): Buffer;
  }
  interface Decipher {
    update(data: Buffer): Buffer;
    final(outputEncoding: string): string;
    setAuthTag(tag: Buffer): void;
  }
  function createCipheriv(algorithm: string, key: Buffer, iv: Buffer): Cipher;
  function createDecipheriv(algorithm: string, key: Buffer, iv: Buffer): Decipher;
  function randomBytes(size: number): Buffer;
  function scryptSync(password: string, salt: string, keylen: number): Buffer;
  interface Sign {
    update(data: string): Sign;
    sign(privateKey: string): Buffer;
  }
  function createSign(algorithm: string): Sign;
}

declare module 'node:http' {
  interface IncomingMessage {
    url?: string;
  }
  interface ServerResponse {
    writeHead(statusCode: number, headers?: Record<string, string>): void;
    end(body?: string): void;
  }
  interface Server {
    close(): void;
    listen(port: number): void;
    on(event: 'error', handler: (err: Error) => void): void;
  }
  type RequestListener = (req: IncomingMessage, res: ServerResponse) => void;
  function createServer(listener: RequestListener): Server;
}
