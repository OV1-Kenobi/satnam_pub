declare module "crypto-browserify" {
  import { Crypto } from "crypto";
  const crypto: Crypto;
  export = crypto;
}
