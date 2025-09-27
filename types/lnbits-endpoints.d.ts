declare module "@/api/endpoints/*.js" {
  export function createLightningAddress(...args: any[]): Promise<any>;
  export function provisionWallet(...args: any[]): Promise<any>;
  export function provisionBoltcard(...args: any[]): Promise<any>;
  export function getPaymentHistory(...args: any[]): Promise<any>;
  export function createBoltcard(...args: any[]): Promise<any>;
}

// Support relative imports from src to project-root api endpoints
declare module "../../api/endpoints/lnbits.js" {
  export function createLightningAddress(...args: any[]): Promise<any>;
  export function provisionWallet(...args: any[]): Promise<any>;
  export function provisionBoltcard(...args: any[]): Promise<any>;
  export function getPaymentHistory(...args: any[]): Promise<any>;
  export function createBoltcard(...args: any[]): Promise<any>;
}
