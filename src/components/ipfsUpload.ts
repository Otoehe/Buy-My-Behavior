// src/components/ipfsUpload.ts
import { NFTStorage } from 'nft.storage';

const NFT_STORAGE_TOKEN = import.meta.env.VITE_NFT_STORAGE_TOKEN;

const client = new NFTStorage({ token: NFT_STORAGE_TOKEN });

export async function uploadToIPFS(file: Blob): Promise<string> {
  const cid = await client.storeBlob(file);
  return cid;
}
