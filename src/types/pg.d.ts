// Minimal ambient types for 'pg' avoid bug on bootstrap script 
declare module "pg" {
  export class Client {
    constructor(config: { connectionString: string });
    connect(): Promise<void>;
    end(): Promise<void>;
    query<T = unknown>(sql: string): Promise<{ rows: T[] }>;
  }
}
